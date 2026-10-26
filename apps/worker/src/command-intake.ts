import { createHash } from 'node:crypto';
import { SUPPORTED_PROTOCOL_VERSIONS, supportsProtocolVersion, type MessageSchemas } from '@taskelith/contracts';
import {
  parseRecoveryEpoch,
  parseSequence,
  type CommandId,
  type CommandRejectionReason,
  type JournaledCommand,
  type LaunchIntent,
  type WorkerId,
  type WorkerJournal,
} from '@taskelith/execution';
import type { WorkerCapacity } from '@taskelith/fleet';
import { err, failure, ok, parseIdentifier, type CorrelationId, type Failure, type Instant, type Result } from '@taskelith/kernel';
import { parseGeneration, parseOwnershipGeneration } from '@taskelith/sdlc';
import type { DeliveredMessage, Publication, PublishOutcome } from '@taskelith/nats';
import { refusalOf } from './assignment-admission.js';
import { publishInventory } from './inventory-report.js';

type Offer = MessageSchemas['AssignmentOfferCommand'];
type Cancellation = MessageSchemas['CancellationCommand'];
type AssignmentEnd = MessageSchemas['AssignmentEndCommand'];
type Confirmation = MessageSchemas['ObservationsConfirmed'];
type InventoryRequest = MessageSchemas['InventoryRequested'];

// The fields every delivered command keeps in every protocol version.
type Versioned = MessageSchemas['VersionedCommand'];

export interface CommandIntakeOptions {
  readonly journal: WorkerJournal;
  readonly capacity: WorkerCapacity;
  readonly publish: (publication: Publication) => Promise<Result<PublishOutcome>>;
  readonly observationSubject: string;
  readonly newReportId: () => string;
  readonly now: () => Instant;
  readonly journalFault: () => Failure | undefined;
  // Called after each W1 commit, so a launch can start at once.
  readonly onRecorded?: () => void;
}

// The worker's command handler: the consumer acks a message only after
// `handle` answers ok, so W1 precedes every acknowledgement.
export class CommandIntake {
  readonly #options: CommandIntakeOptions;
  readonly #workerId: WorkerId;

  constructor(options: CommandIntakeOptions) {
    this.#options = options;
    this.#workerId = options.journal.binding.workerId;
  }

  readonly handle = async (message: DeliveredMessage): Promise<Result<unknown>> => {
    switch (message.type) {
      case 'execution.observations.confirmed':
        return this.#confirm(checked<Confirmation>(message));
      case 'worker.inventory.requested':
        return this.#answerInventory(checked<InventoryRequest>(message));
      default: {
        const command = this.#journaled(checked<Versioned>(message));
        const recorded = command.ok ? this.#options.journal.recordCommand(command.value) : command;
        if (recorded.ok) this.#options.onRecorded?.();
        return recorded;
      }
    }
  };

  #journaled(command: Versioned): Result<JournaledCommand> {
    const { metadata, payload } = command;
    const source = {
      commandId: metadata.commandId as CommandId,
      digest: createHash('sha256').update(canonicalJson(command)).digest('hex'),
      correlationId: metadata.correlationId as CorrelationId,
    };
    if (!supportsProtocolVersion(SUPPORTED_PROTOCOL_VERSIONS, payload.protocolVersion)) {
      return ok(rejected(source, metadata.commandType, 'protocol-not-supported'));
    }
    if (metadata.workerId !== this.#workerId) return ok(rejected(source, metadata.commandType, 'addressed-to-another-worker'));
    switch (metadata.commandType) {
      case 'execution.assignment.offer':
        return this.#offer(source, command as Offer);
      case 'execution.cancellation.request': {
        const { metadata: { attemptId }, payload: { executionId } } = command as Cancellation;
        const target = executionId === undefined ? { kind: 'attempt' as const, attemptId } : { kind: 'execution' as const, executionId };
        return ok({ ...source, outcome: 'accepted', kind: 'cancellation', target } as JournaledCommand);
      }
      case 'execution.assignment.end': {
        const { assignmentId } = (command as AssignmentEnd).payload;
        return ok({ ...source, outcome: 'accepted', kind: 'assignment-end', assignmentId } as JournaledCommand);
      }
      default:
        return err(failure('invalid', `unknown command type ${metadata.commandType}`));
    }
  }

  // The admission reads the journal outside W1, which is safe because one
  // consumer journals this worker's commands one at a time.
  #offer(source: JournaledSource, offer: Offer): Result<JournaledCommand> {
    const intent = intentOf(offer);
    if (!intent.ok) return intent;
    const journal = this.#options.journal.snapshot();
    if (!journal.ok) return journal;
    const reason = refusalOf(intent.value.requested, journal.value, this.#options.capacity);
    if (reason === undefined) return ok({ ...source, outcome: 'accepted', kind: 'assignment', intent: intent.value });
    const { assignmentId, attemptId, ownershipGeneration } = intent.value;
    const rejection = { kind: 'assignment-refused' as const, assignment: { assignmentId, attemptId, ownershipGeneration }, reason };
    return ok({ ...source, outcome: 'rejected', kind: offer.metadata.commandType, rejection });
  }

  // A confirmation of another journal, or beyond what this journal assigned,
  // confirms nothing here (wire contracts section 6).
  #confirm(confirmation: Confirmation): Result<unknown> {
    const { binding } = this.#options.journal;
    if (confirmation.workerId !== binding.workerId || confirmation.journalId !== binding.journalId) return ok(undefined);
    const sequence = parseSequence(confirmation.confirmedThrough);
    const confirmed = sequence.ok ? this.#options.journal.confirmThrough(sequence.value) : sequence;
    return !confirmed.ok && confirmed.error.code === 'invalid' ? ok(undefined) : confirmed;
  }

  // A failed part fails the answer; the redelivered request takes a new
  // snapshot, which replaces this one.
  #answerInventory(request: InventoryRequest): Promise<Result<unknown>> {
    if (request.workerId !== this.#workerId) return Promise.resolve(ok(undefined));
    return publishInventory(this.#options, request.requestId);
  }
}

function intentOf({ metadata, payload }: Offer): Result<LaunchIntent> {
  const parsed = {
    assignmentId: parseIdentifier('AssignmentId', payload.assignmentId),
    attemptId: parseIdentifier('AttemptId', metadata.attemptId),
    ownershipGeneration: parseOwnershipGeneration(metadata.ownershipGeneration),
    admissionId: parseIdentifier('AdmissionId', metadata.sdlc.admissionId),
    admissionGeneration: parseGeneration(metadata.sdlc.admissionGeneration),
    recoveryEpoch: parseRecoveryEpoch(payload.recoveryEpoch),
  };
  const values: Record<string, unknown> = {};
  for (const [field, result] of Object.entries(parsed)) {
    if (!result.ok) return result;
    values[field] = result.value;
  }
  const { cpuMillicores, memoryMebibytes, hardControls } = payload.reservation.requested;
  const requested = Object.freeze({ cpuMillicores, memoryMebibytes, hardControls: Object.freeze([...hardControls]) });
  return ok(Object.freeze({ ...values, requested }) as LaunchIntent);
}

// Sorted keys, so a resent command's digest does not depend on its sender's
// key order; the content itself must be the stored command's.
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value !== 'object' || value === null) return JSON.stringify(value);
  const entries = Object.entries(value).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, field]) => `${JSON.stringify(key)}:${canonicalJson(field)}`).join(',')}}`;
}

// The reader validated the body against the schema its type names.
function checked<Body>(message: DeliveredMessage): Body {
  return message.body as unknown as Body;
}

type JournaledSource = Pick<JournaledCommand, 'commandId' | 'digest' | 'correlationId'>;

function rejected(source: JournaledSource, commandType: string, reason: CommandRejectionReason): JournaledCommand {
  const rejection = { kind: 'command-rejected' as const, commandType, reason, supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS };
  return { ...source, outcome: 'rejected', kind: commandType, rejection };
}

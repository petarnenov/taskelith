import { EXECUTION_PROTOCOL_VERSION, type MessageSchemas } from '@taskelith/contracts';
import type { CommandCause, JournalBinding, JournalInventory, OutboxEntry } from '@taskelith/execution';
import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';

// The wire shapes of execution.asyncapi.json for what the journal records.

const SCHEMA_VERSION = 1;
const ITEMS_PER_PART = 256;

export type ObservationMessage = { readonly metadata: Record<string, unknown>; readonly payload: Record<string, unknown> };

// Execution facts get their wire mapping with the launches that produce them.
export function observationMessage(entry: OutboxEntry): Result<ObservationMessage> {
  const { fact } = entry;
  switch (fact.kind) {
    case 'command-rejected': {
      const { commandId, commandType, reason, supportedProtocolVersions } = fact;
      const metadata = metadataOf(entry, 'execution.command.rejected', causedBy(fact));
      return ok({ metadata, payload: { commandId, commandType, reason, supportedProtocolVersions } });
    }
    case 'assignment-accepted': {
      const { commandId, assignmentId, attemptId, ownershipGeneration } = fact;
      const metadata = { ...metadataOf(entry, 'execution.assignment.accepted', causedBy(fact)), attemptId, ownershipGeneration };
      return ok({ metadata, payload: { commandId, assignmentId } });
    }
    case 'assignment-refused': {
      const { commandId, assignmentId, attemptId, ownershipGeneration, reason } = fact;
      const metadata = { ...metadataOf(entry, 'execution.assignment.refused', causedBy(fact)), attemptId, ownershipGeneration };
      return ok({ metadata, payload: { commandId, assignmentId, reason, retryable: false } });
    }
    case 'capacity-declared': {
      const { protocolVersions, ...capacity } = fact.capacity;
      const metadata = metadataOf(entry, 'worker.capacity.declared', { correlationId: entry.position.observationId });
      return ok({ metadata, payload: { capacity, protocolVersions } });
    }
    default:
      return err(failure('precondition-failed', `this worker cannot publish ${fact.kind} yet`, { kind: fact.kind }));
  }
}

function causedBy(cause: CommandCause): Record<string, string> {
  return { correlationId: cause.correlationId, causationId: cause.commandId };
}

function metadataOf(entry: OutboxEntry, observationType: string, correlation: Record<string, string>): Record<string, unknown> {
  const { observationId, workerId, journalId, sequence } = entry.position;
  return {
    observationId, observationType, schemaVersion: SCHEMA_VERSION, protocolVersion: EXECUTION_PROTOCOL_VERSION,
    occurredAt: entry.recordedAt, ...correlation, workerId, journalId, sequence,
  };
}

export interface InventoryAnswer {
  readonly reportId: string;
  readonly requestId: string;
  readonly reportedAt: Instant;
}

type InventoryReported = MessageSchemas['InventoryReported'];

// One snapshot in parts of at most 256 assignments and 256 executions.
export function inventoryParts(binding: JournalBinding, inventory: JournalInventory, answer: InventoryAnswer): InventoryReported[] {
  const assignments = inventory.journal.intents.map(({ commandId, assignmentId, attemptId, ownershipGeneration, ended }) => (
    { commandId, assignmentId, attemptId, ownershipGeneration, state: ended ? 'ended' as const : 'accepted' as const }));
  const executions = inventory.journal.executions.map(({ executionId, assignmentId, state, uncertain }) => (
    { executionId, assignmentId, state: state ?? 'launch-intended' as const, uncertain }));
  const parts = Math.max(1, Math.ceil(assignments.length / ITEMS_PER_PART), Math.ceil(executions.length / ITEMS_PER_PART));
  return Array.from({ length: parts }, (_, index) => ({
    messageType: 'worker.inventory.reported', schemaVersion: SCHEMA_VERSION, protocolVersion: EXECUTION_PROTOCOL_VERSION,
    ...answer, snapshot: inventory.snapshot, part: index + 1, parts,
    workerId: binding.workerId, journalId: binding.journalId, throughSequence: inventory.throughSequence,
    assignments: assignments.slice(index * ITEMS_PER_PART, (index + 1) * ITEMS_PER_PART),
    executions: executions.slice(index * ITEMS_PER_PART, (index + 1) * ITEMS_PER_PART),
  }));
}

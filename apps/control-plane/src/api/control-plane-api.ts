import type { HttpSchemas } from '@taskelith/contracts';
import type { Enrollment, EnrollmentRequest, WorkerPrincipal } from '@taskelith/fleet';
import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import type { QuarantineRecord } from '@taskelith/nats';
import type { RunService } from '../application/run-service.js';
import type { TaskService } from '../application/task-service.js';
import type { ApiHandlers, ApiRequest } from './api-server.js';

export const QUARANTINE_PAGE = 100;
// The capacity columns are PostgreSQL integers.
export const MAX_CAPACITY_VALUE = 2_147_483_647;
export const QUARANTINE_REASON_LENGTH = 512;

// The operations the API reaches beyond the run and task use cases.
export interface ApiServices {
  readonly runs: RunService;
  readonly tasks: TaskService;
  readonly operator: { authenticate(secret: string): Promise<Result<void>> };
  readonly enrollment: {
    enroll(tokenSecret: string, request: EnrollmentRequest): Promise<Result<Enrollment>>;
    authenticateWorkerBearer(secret: string): Promise<Result<WorkerPrincipal>>;
  };
  readonly quarantine: {
    records(fromSequence?: number, limit?: number): Promise<Result<readonly QuarantineRecord[]>>;
    redrive(sequence: number): Promise<Result<string | null>>;
  };
}

// Maps each operation of the route table to its use case, and the contract
// shapes to and from the modules' own.
export class ControlPlaneApi implements ApiHandlers {
  readonly #services: ApiServices;

  constructor(services: ApiServices) {
    this.#services = services;
  }

  authenticateOperator(secret: string): Promise<Result<void>> {
    return this.#services.operator.authenticate(secret);
  }

  authenticateWorker(secret: string): Promise<Result<WorkerPrincipal>> {
    return this.#services.enrollment.authenticateWorkerBearer(secret);
  }

  async handle(operationId: string, request: ApiRequest, bearer: string): Promise<Result<unknown>> {
    const [first = '', second = ''] = request.parameters;
    switch (operationId) {
      case 'createRun':
        return this.#services.runs.createRun(request.body as HttpSchemas['CreateRunRequest']);
      case 'submitTask':
        return this.#services.tasks.submitTask(first, request.body as HttpSchemas['SubmitTaskRequest'], request.correlationId);
      case 'readAdmission':
        return this.#services.tasks.readAdmission(first, second);
      case 'readTaskResult':
        return this.#services.tasks.readTaskResult(first, second);
      case 'enrollWorker':
        return this.#enroll(bearer, request.body as HttpSchemas['EnrollmentRequest']);
      case 'listQuarantine':
        return this.#listQuarantine(request.query);
      case 'redriveQuarantined':
        return this.#redrive(first);
      default:
        return err(failure('internal', `operation ${operationId} has no handler`));
    }
  }

  async #enroll(tokenSecret: string, body: HttpSchemas['EnrollmentRequest']): Promise<Result<HttpSchemas['Enrollment']>> {
    const journalId = parseIdentifier('JournalId', body.journalId);
    if (!journalId.ok) return journalId;
    const { slots, cpuMillicores, memoryMebibytes, enforceableControls } = body.capacity;
    // Checked before the token is presented, so a refusal consumes nothing.
    if ([slots, cpuMillicores, memoryMebibytes].some((amount) => amount > MAX_CAPACITY_VALUE)) {
      return err(failure('invalid', `a capacity value exceeds ${MAX_CAPACITY_VALUE}`));
    }
    const enrolled = await this.#services.enrollment.enroll(tokenSecret, {
      journalId: journalId.value,
      host: body.host,
      protocolVersions: body.protocolVersions,
      capacity: { slots, cpuMillicores, memoryMebibytes, controls: enforceableControls },
    });
    if (!enrolled.ok) return enrolled;
    const { installationId, workerId, credentialGeneration, recoveryEpoch, protocolVersions, credentials } = enrolled.value;
    return ok({ installationId, workerId, credentialGeneration, recoveryEpoch, protocolVersions, credentials });
  }

  async #listQuarantine(query: URLSearchParams): Promise<Result<HttpSchemas['QuarantinePage']>> {
    const from = query.get('from');
    const fromSequence = from === null ? 1 : Number(from);
    if (!Number.isSafeInteger(fromSequence) || fromSequence < 1) return err(failure('invalid', 'from must be a positive integer'));
    const records = await this.#services.quarantine.records(fromSequence, QUARANTINE_PAGE);
    if (!records.ok) return records;
    const page = records.value.map(recordView);
    const last = page.at(-1);
    return ok(page.length === QUARANTINE_PAGE && last !== undefined ? { records: page, next: last.sequence + 1 } : { records: page });
  }

  async #redrive(text: string): Promise<Result<HttpSchemas['Redrive']>> {
    const sequence = Number(text);
    if (!Number.isSafeInteger(sequence) || sequence < 1) return err(failure('invalid', 'the sequence must be a positive safe integer'));
    const redriven = await this.#services.quarantine.redrive(sequence);
    if (!redriven.ok) return redriven;
    return ok(redriven.value === null ? { sequence } : { sequence, messageId: redriven.value });
  }
}

function recordView(record: QuarantineRecord): HttpSchemas['QuarantineRecord'] {
  const { sequence, source, originalSubject, originalStreamSequence, originalMessageId, consumer, deliveries, reason } = record;
  return {
    sequence, source, originalSubject, originalStreamSequence, consumer, deliveries, bodyExpired: record.body === null,
    // A reason is a diagnostic; the contract bounds it, so a longer one is cut.
    reason: reason.slice(0, QUARANTINE_REASON_LENGTH),
    ...(originalMessageId === undefined ? {} : { originalMessageId }),
  };
}

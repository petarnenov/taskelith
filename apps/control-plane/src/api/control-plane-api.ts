import type { HttpSchemas } from '@taskelith/contracts';
import type { LaunchAuthorizationRequest, LaunchOutcome } from '@taskelith/execution';
import type { ConfirmedCredentials, CredentialRenewalRequest, Enrollment, EnrollmentRequest, RenewedCredentials, WorkerPrincipal } from '@taskelith/fleet';
import type { SecretHash } from '@taskelith/access';
import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import type { QuarantineRecord } from '@taskelith/nats';
import type { DelegationService } from '../application/delegation-service.js';
import type { EvidenceService } from '../application/evidence-service.js';
import type { RunService } from '../application/run-service.js';
import type { TaskService } from '../application/task-service.js';
import { StatusAnswer, type ApiHandlers, type ApiRequest, type Upload } from './api-server.js';
import { launchOutcomeBody, parseLaunchAuthorizationRequest } from './launch-wire.js';

export const QUARANTINE_PAGE = 100;
export const QUARANTINE_REASON_LENGTH = 512;

// The operations the API reaches beyond the run and task use cases.
export interface ApiServices {
  readonly runs: RunService;
  readonly tasks: TaskService;
  readonly evidence: EvidenceService;
  readonly delegations: DelegationService;
  readonly operator: { authenticate(secret: string): Promise<Result<void>> };
  readonly enrollment: {
    enroll(tokenSecret: string, request: EnrollmentRequest): Promise<Result<Enrollment>>;
    authenticateWorkerBearer(secret: string): Promise<Result<WorkerPrincipal>>;
    renew(principal: WorkerPrincipal, request: CredentialRenewalRequest): Promise<Result<RenewedCredentials>>;
    confirm(principal: WorkerPrincipal, generation: number): Promise<Result<ConfirmedCredentials>>;
  };
  readonly launches: {
    authorize(principal: WorkerPrincipal, request: LaunchAuthorizationRequest): Promise<Result<LaunchOutcome>>;
  };
  // The public installation CA certificate, read and checked at start.
  readonly installationCa: string;
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
      case 'publishEvidence':
        return this.#publish(request);
      case 'requestDelegation':
        return this.#requestDelegation(request);
      case 'readEvidence':
        return this.#services.evidence.read(first);
      case 'downloadEvidence':
        return this.#download(first);
      case 'readInstallationCa':
        return ok({ certificate: this.#services.installationCa });
      case 'enrollWorker':
        return this.#enroll(bearer, request.body as HttpSchemas['EnrollmentRequest']);
      case 'renewWorkerCredentials':
        return this.#renew(request);
      case 'confirmWorkerCredentials':
        return this.#confirm(request);
      case 'authorizeLaunch':
        return this.#authorizeLaunch(request);
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

  // The schema admits only the public key and a lowercase SHA-256.
  async #renew({ worker, body }: ApiRequest): Promise<Result<HttpSchemas['CredentialRenewal']>> {
    if (worker === undefined) return err(failure('internal', 'renewWorkerCredentials reached its handler without a worker'));
    const { credentialGeneration, brokerUserPublicKey, controlPlaneSecretSha256 } = body as HttpSchemas['CredentialRenewalRequest'];
    const renewed = await this.#services.enrollment.renew(worker, {
      credentialGeneration, brokerUserPublicKey, controlPlaneSecretSha256: controlPlaneSecretSha256 as SecretHash,
    });
    if (!renewed.ok) return renewed;
    const { brokerUserJwt, deadline } = renewed.value;
    return ok({ credentialGeneration: renewed.value.credentialGeneration, brokerUserJwt, deadline });
  }

  async #confirm({ worker, body }: ApiRequest): Promise<Result<HttpSchemas['CredentialConfirmation']>> {
    if (worker === undefined) return err(failure('internal', 'confirmWorkerCredentials reached its handler without a worker'));
    const { credentialGeneration } = body as HttpSchemas['CredentialConfirmationRequest'];
    const confirmed = await this.#services.enrollment.confirm(worker, credentialGeneration);
    return confirmed.ok ? ok({ ...confirmed.value }) : confirmed;
  }

  async #authorizeLaunch(request: ApiRequest): Promise<Result<HttpSchemas['LaunchAuthorizationOutcome']>> {
    if (request.worker === undefined) return err(failure('internal', 'a worker operation has no principal'));
    const values = parseLaunchAuthorizationRequest(request.body as HttpSchemas['LaunchAuthorizationRequest']);
    if (!values.ok) return values;
    const outcome = await this.#services.launches.authorize(request.worker, values.value);
    return outcome.ok ? ok(launchOutcomeBody(outcome.value)) : outcome;
  }

  async #publish({ worker, body }: ApiRequest): Promise<Result<StatusAnswer>> {
    if (worker === undefined) return err(failure('internal', 'publishEvidence reached its handler without a worker'));
    const { record, content } = body as Upload;
    const published = await this.#services.evidence.publish(worker, record as HttpSchemas['EvidencePublication'], content);
    if (!published.ok) return published;
    return ok(new StatusAnswer(published.value.created ? 201 : 200, published.value.record));
  }

  async #requestDelegation({ worker, body, correlationId }: ApiRequest): Promise<Result<HttpSchemas['DelegationOutcome']>> {
    if (worker === undefined) return err(failure('internal', 'requestDelegation reached its handler without a worker'));
    return this.#services.delegations.requestDelegation(worker, body as HttpSchemas['DelegationRequest'], correlationId);
  }

  async #download(evidenceId: string): Promise<Result<Uint8Array>> {
    const downloaded = await this.#services.evidence.download(evidenceId);
    return downloaded.ok ? ok(downloaded.value.content) : downloaded;
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

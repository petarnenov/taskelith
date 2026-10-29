import {
  g2BridgeRequirement,
  projectRead,
  unauthenticated,
  viewOf as viewOfSession,
  type AccessRequirement,
  type LiveSession,
  type LoginAttempt,
  type PrincipalId,
  type ProjectRole,
  type SecretHash,
  type SessionAnswer,
} from '@taskelith/access';
import type { HttpSchemas } from '@taskelith/contracts';
import type { LaunchAuthorizationRequest, LaunchOutcome } from '@taskelith/execution';
import type { ConfirmedCredentials, CredentialRenewalRequest, Enrollment, EnrollmentRequest, RenewedCredentials, WorkerPrincipal } from '@taskelith/fleet';
import { err, failure, ok, parseIdentifier, type Failure, type FailureCode, type Result } from '@taskelith/kernel';
import type { QuarantineRecord } from '@taskelith/nats';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import { redactSecrets } from '@taskelith/secrets';
import type { DelegationService } from '../application/delegation-service.js';
import type { EvidenceService } from '../application/evidence-service.js';
import type { RunService } from '../application/run-service.js';
import type { RevealedSlotDelivery, SlotCredentialFetchRequest } from '../application/slot-credential-delivery.js';
import type { TaskService } from '../application/task-service.js';
import { StatusAnswer, type ApiHandlers, type ApiRequest, type Caller, type Upload } from './api-server.js';
import { ruleOf } from './access-requirements.js';
import { launchOutcomeBody, parseLaunchAuthorizationRequest } from './launch-wire.js';
import { parseSlotCredentialFetch, slotCredentialBody } from './slot-credential-wire.js';
import { expiredSessionCookie, sessionSetCookie } from './session-cookie.js';

export const QUARANTINE_PAGE = 100;
export const QUARANTINE_REASON_LENGTH = 512;

// The renewal failures answered 400, 401, or 409.
const RENEWAL_REFUSALS: ReadonlySet<FailureCode> = new Set(['invalid', 'forbidden', 'conflict']);

// The operations the API reaches beyond the run and task use cases.
export interface ApiServices {
  readonly runs: RunService;
  readonly tasks: TaskService;
  readonly evidence: EvidenceService;
  readonly delegations: DelegationService;
  // The principal of the operator bearer, the first installation-owner.
  readonly operator: { authenticate(secret: string): Promise<Result<PrincipalId>> };
  readonly sessions: {
    authenticate(sessionId: string): Promise<Result<LiveSession>>;
    start(): Promise<Result<SessionAnswer>>;
    logIn(live: LiveSession, attempt: LoginAttempt): Promise<Result<SessionAnswer>>;
    logOut(live: LiveSession): Promise<Result<void>>;
  };
  readonly authorization: { authorize(principalId: PrincipalId, requirement: AccessRequirement): Promise<Result<void>> };
  // The project of a run, for the role check of the run's operations.
  readonly runProjects: { projectOf(runId: string): Promise<Result<string | undefined>> };
  readonly enrollment: {
    enroll(tokenSecret: string, request: EnrollmentRequest): Promise<Result<Enrollment>>;
    authenticateWorkerBearer(secret: string): Promise<Result<WorkerPrincipal>>;
    renew(principal: WorkerPrincipal, request: CredentialRenewalRequest): Promise<Result<RenewedCredentials>>;
    confirm(principal: WorkerPrincipal, generation: number): Promise<Result<ConfirmedCredentials>>;
  };
  readonly launches: {
    authorize(principal: WorkerPrincipal, request: LaunchAuthorizationRequest): Promise<Result<LaunchOutcome>>;
  };
  // Slot credential delivery; absent until the composition has the key and
  // the admitted pairs (sub-change 12d), and then answered 503.
  readonly slotCredentials?: {
    fetch(principal: WorkerPrincipal, request: SlotCredentialFetchRequest): Promise<Result<RevealedSlotDelivery>>;
  };
  // The public installation CA certificate, read and checked at start.
  readonly installationCa: string;
  readonly quarantine: {
    records(fromSequence?: number, limit?: number): Promise<Result<readonly QuarantineRecord[]>>;
    redrive(sequence: number): Promise<Result<string | null>>;
  };
  readonly logger?: Logger;
}

// Maps each operation of the route table to its use case, and the contract
// shapes to and from the modules' own.
export class ControlPlaneApi implements ApiHandlers {
  readonly #services: ApiServices;

  constructor(services: ApiServices) {
    this.#services = services;
  }

  authenticateOperator(secret: string): Promise<Result<PrincipalId>> {
    return this.#services.operator.authenticate(secret);
  }

  authenticateWorker(secret: string): Promise<Result<WorkerPrincipal>> {
    return this.#services.enrollment.authenticateWorkerBearer(secret);
  }

  authenticateSession(sessionId: string): Promise<Result<LiveSession>> {
    return this.#services.sessions.authenticate(sessionId);
  }

  authorize(principalId: PrincipalId, requirement: AccessRequirement): Promise<Result<void>> {
    return this.#services.authorization.authorize(principalId, requirement);
  }

  // The role on the project of the resource that the path names, which the
  // server checks before the body (wire contracts section 2).
  authorizeResource(operationId: string, caller: Caller, parameters: readonly string[]): Promise<Result<void>> {
    const rule = ruleOf(operationId);
    const [first = ''] = parameters;
    if (rule.kind === 'evidence-project') return this.#authorizeEvidence(caller.principalId, first);
    if (rule.kind !== 'resource-project' || rule.projectIn !== 'path-resource') return Promise.resolve(ok(undefined));
    return this.#authorizeRunProject(caller.principalId, rule.role, () => this.#services.runProjects.projectOf(first));
  }

  async handle(operationId: string, request: ApiRequest, bearer: string): Promise<Result<unknown>> {
    const authorized = await this.#authorizeBodyProject(operationId, request);
    if (!authorized.ok) return authorized;
    return this.#dispatch(operationId, request, bearer);
  }

  async #dispatch(operationId: string, request: ApiRequest, bearer: string): Promise<Result<unknown>> {
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
      case 'readSession':
        return this.#readSession(request);
      case 'logIn':
        return this.#logIn(request);
      case 'logOut':
        return this.#logOut(request);
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
      case 'fetchSlotCredential':
        return this.#fetchSlotCredential(request);
      case 'listQuarantine':
        return this.#listQuarantine(request.query);
      case 'redriveQuarantined':
        return this.#redrive(first);
      default:
        return err(failure('internal', `operation ${operationId} has no handler`));
    }
  }

  // `createRun`, whose project its body names, after the body's schema check.
  #authorizeBodyProject(operationId: string, request: ApiRequest): Promise<Result<void>> {
    const rule = ruleOf(operationId);
    if (rule.kind !== 'resource-project' || rule.projectIn !== 'body') return Promise.resolve(ok(undefined));
    const { projectId } = request.body as HttpSchemas['CreateRunRequest'];
    return this.#authorizeRunProject(request.principalId, rule.role, async () => ok(projectId));
  }

  // An unknown resource, whose project is undefined, is denied to every
  // caller but the owner, so that no other learns it is unknown.
  async #authorizeRunProject(
    principalId: PrincipalId | undefined, role: ProjectRole, projectOf: () => Promise<Result<string | undefined>>,
  ): Promise<Result<void>> {
    if (principalId === undefined) return err(unauthenticated());
    const projectId = await projectOf();
    if (!projectId.ok) return projectId;
    // The temporary G2 bridge (Q5), which item 11 retires.
    return this.#services.authorization.authorize(principalId, g2BridgeRequirement(projectId.value, role));
  }

  // Execution wire contracts section 8.2: a record outside the caller's
  // projects answers the same 404 as an unknown one.
  async #authorizeEvidence(principalId: PrincipalId | undefined, evidenceId: string): Promise<Result<void>> {
    if (principalId === undefined) return err(unauthenticated());
    const record = await this.#services.evidence.read(evidenceId);
    if (!record.ok) return record.error.code === 'not-found' ? err(evidenceNotFound()) : record;
    const authorized = await this.#services.authorization.authorize(principalId, projectRead(record.value.projectId));
    if (authorized.ok || authorized.error.code !== 'forbidden') return authorized;
    return err(evidenceNotFound());
  }

  async #readSession(request: ApiRequest): Promise<Result<StatusAnswer>> {
    if (request.session !== undefined) return ok(sessionAnswer({ view: viewOfSession(request.session) }));
    const started = await this.#services.sessions.start();
    return started.ok ? ok(sessionAnswer(started.value)) : started;
  }

  async #logIn(request: ApiRequest): Promise<Result<StatusAnswer>> {
    if (request.session === undefined) return err(failure('internal', 'logIn reached its handler without a session'));
    const { loginName, password } = request.body as HttpSchemas['LoginRequest'];
    const sourceAddress = request.sourceAddress ?? 'unknown';
    const loggedIn = await this.#services.sessions.logIn(request.session, { loginName, password, sourceAddress });
    if (loggedIn.ok) return ok(sessionAnswer(loggedIn.value));
    if (loggedIn.error.details.reason === 'login-failed') {
      const logger = this.#services.logger ?? SILENT_LOGGER;
      logger.warn('access.login.failed', { loginName: redactSecrets(loginName), sourceAddress: redactSecrets(sourceAddress) });
    }
    return loggedIn;
  }

  async #logOut(request: ApiRequest): Promise<Result<StatusAnswer>> {
    if (request.session === undefined) return err(failure('internal', 'logOut reached its handler without a session'));
    const ended = await this.#services.sessions.logOut(request.session);
    return ended.ok ? ok(new StatusAnswer(204, undefined, { 'set-cookie': expiredSessionCookie() })) : ended;
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
    if (!renewed.ok) {
      this.#logRefusal(worker, credentialGeneration, renewed.error);
      return renewed;
    }
    const { brokerUserJwt, deadline } = renewed.value;
    return ok({ credentialGeneration: renewed.value.credentialGeneration, brokerUserJwt, deadline });
  }

  // Logged, not audited, so that a mismatch names its worker; the key is
  // `generation`, as the logger redacts a key that names a credential.
  #logRefusal(worker: WorkerPrincipal, credentialGeneration: number, failed: Failure): void {
    if (!RENEWAL_REFUSALS.has(failed.code)) return;
    const fields = { generation: credentialGeneration, code: failed.code, reason: failed.details.reason ?? failed.message };
    (this.#services.logger ?? SILENT_LOGGER).with({ workerId: worker.workerId }).warn('fleet.credentials.renewal-refused', fields);
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

  async #fetchSlotCredential({ worker, parameters, query }: ApiRequest): Promise<Result<HttpSchemas['SlotCredentialDelivery']>> {
    if (worker === undefined) return err(failure('internal', 'fetchSlotCredential reached its handler without a worker'));
    const values = parseSlotCredentialFetch(parameters, query);
    if (!values.ok) return values;
    const deliveries = this.#services.slotCredentials;
    if (deliveries === undefined) return err(failure('unavailable', 'slot credential delivery is not configured'));
    const delivered = await deliveries.fetch(worker, values.value);
    return delivered.ok ? ok(slotCredentialBody(delivered.value)) : delivered;
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

// One body for an unknown record and a foreign one, naming neither.
function evidenceNotFound(): Failure {
  return failure('not-found', 'no evidence record has this identifier');
}

// The session state, with a Set-Cookie header for a new identifier.
function sessionAnswer({ view, cookie }: SessionAnswer): StatusAnswer {
  return new StatusAnswer(200, view, cookie === undefined ? {} : { 'set-cookie': sessionSetCookie(cookie) });
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

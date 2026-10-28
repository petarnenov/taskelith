import { err, failure, instantFromEpochMilliseconds, ok, type Instant, type Result } from '@taskelith/kernel';
import { checkAdministrativeInvocation, type SecretHash, type Secrets } from '@taskelith/access';
import type { RecoveryEpoch, WorkerId } from '@taskelith/execution';
import type { Clock } from '@taskelith/sdlc';
import {
  commonProtocolVersion,
  hostMismatch,
  isExpired,
  validGenerations,
  type CredentialGeneration,
  type EnrolledWorker,
  type EnrollmentRequest,
  type HostConstraints,
  type ProtocolWindow,
  type RotationRequest,
  type WorkerPrincipal,
} from '../domain/enrollment.js';
import { rotationConflict } from '../domain/credential-rotation.js';
import { FLEET_LIMITS, type FleetLimits } from '../domain/fleet-limits.js';
import { parseWorkerId, type InstallationIdentity } from '../domain/installation.js';
import type { BrokerCredentials } from '../ports/broker-credentials.js';
import type { WorkerCommandConsumers } from '../ports/command-consumers.js';
import type { FleetRegistry } from '../ports/fleet-registry.js';
import type { IdentifierSource } from '../ports/identifier-source.js';

// What enrollment returns, once; `credentials` are the worker's secrets.
export interface Enrollment {
  readonly installationId: string;
  readonly workerId: WorkerId;
  readonly credentialGeneration: number;
  readonly recoveryEpoch: RecoveryEpoch;
  readonly protocolVersions: ProtocolWindow;
  readonly credentials: { readonly controlPlane: string; readonly broker: string };
}

// The operator's actor and reason for a rotation's audit event.
export interface RotationInvocation {
  readonly actor: string;
  readonly reason: string;
}

// What `rotate-worker` prints: no secret.
export interface RequestedRotation {
  readonly workerId: WorkerId;
  readonly credentialGeneration: number;
  readonly deadline: Instant;
}

// The public part of the generation the worker generated.
export interface CredentialRenewalRequest {
  readonly credentialGeneration: number;
  readonly brokerUserPublicKey: string;
  readonly controlPlaneSecretSha256: SecretHash;
}

export interface RenewedCredentials {
  readonly credentialGeneration: number;
  readonly brokerUserJwt: string;
  readonly deadline: Instant;
}

// `revocationsPublished` false means the dropped predecessor is recorded but
// the broker does not know yet; the next publication retries it.
export interface ConfirmedCredentials {
  readonly credentialGeneration: number;
  readonly revocationsPublished: boolean;
}

// `commandConsumerRemoved` false: the consumer is left, and a start retries
// while the worker is among the latest revoked (operational targets).
export interface WorkerRevocation {
  readonly commandConsumerRemoved: boolean;
}

export interface EnrollmentServiceDependencies {
  readonly installation: InstallationIdentity;
  readonly serverProtocolVersions: ProtocolWindow;
  readonly registry: FleetRegistry;
  readonly secrets: Secrets;
  readonly ids: IdentifierSource;
  readonly broker: BrokerCredentials;
  readonly commandConsumers: WorkerCommandConsumers;
  readonly clock: Clock;
  readonly limits?: FleetLimits;
}

// Enrollment, rotation, revocation, and authentication (trust model sec. 4).
// A failure's `reason` maps to 401, 409, or 422 of the API.
export class EnrollmentService {
  readonly #deps: EnrollmentServiceDependencies;
  readonly #limits: FleetLimits;

  constructor(dependencies: EnrollmentServiceDependencies) {
    this.#deps = dependencies;
    this.#limits = dependencies.limits ?? FLEET_LIMITS;
  }

  // Returns the token's secret, which the owner hands to the worker host.
  async issueToken(constraints: HostConstraints): Promise<Result<string>> {
    const issued = this.#deps.secrets.issue('enrollment');
    const issuedAt = this.#deps.clock.now();
    const expiresAt = this.#after(issuedAt, this.#limits.enrollmentTokenTtlMilliseconds);
    const added = await this.#deps.registry.addToken({ hash: issued.hash, issuedAt, expiresAt, constraints: Object.freeze({ ...constraints }) });
    return added.ok ? ok(issued.secret) : added;
  }

  async enroll(tokenSecret: string, request: EnrollmentRequest): Promise<Result<Enrollment>> {
    const now = this.#deps.clock.now();
    const tokenHash = this.#deps.secrets.hashOf(tokenSecret);
    const token = await this.#deps.registry.unusedToken(tokenHash);
    if (!token.ok) return token;
    if (token.value === undefined || isExpired(token.value, now)) return err(reasoned('forbidden', 'token-invalid', 'the enrollment token is unknown, used, or expired'));
    const field = hostMismatch(token.value.constraints, request.host);
    if (field !== undefined) return err(reasoned('precondition-failed', 'host-mismatch', `the host ${field} does not match the token`));
    const protocolVersion = commonProtocolVersion(request.protocolVersions, this.#deps.serverProtocolVersions);
    if (protocolVersion === undefined) {
      return err(reasoned('precondition-failed', 'protocol-not-supported', 'no protocol version is supported by both sides'));
    }
    const workerId = parseWorkerId(this.#deps.ids.newWorkerId());
    if (!workerId.ok) return workerId;
    // Before the token is used; a commit that fails after it leaves an
    // unused consumer of an unknown worker, which is harmless.
    const consumer = await this.#deps.commandConsumers.ensure(workerId.value);
    if (!consumer.ok) return err(failure('unavailable', `the worker's command consumer is not ready: ${consumer.error.message}`));
    const issued = await this.#issueGeneration(workerId.value, 1);
    if (!issued.ok) return issued;
    const worker: EnrolledWorker = Object.freeze({
      workerId: workerId.value, journalId: request.journalId, host: request.host, protocolVersions: request.protocolVersions, protocolVersion,
      capacity: request.capacity, credentials: Object.freeze({ current: issued.value.generation }), enrolledAt: now,
    });
    const enrolled = await this.#deps.registry.enroll(tokenHash, worker);
    if (!enrolled.ok) return enrollFailure(enrolled.error);
    return ok({
      installationId: this.#deps.installation.installationId, workerId: workerId.value, credentialGeneration: 1,
      recoveryEpoch: this.#deps.installation.recoveryEpoch, protocolVersions: this.#deps.serverProtocolVersions,
      credentials: issued.value.secrets,
    });
  }

  // Only requests the next generation (installation contract section 6);
  // an open rotation is answered unchanged.
  async requestRotation(workerId: WorkerId, invocation: RotationInvocation): Promise<Result<RequestedRotation>> {
    const checked = checkAdministrativeInvocation(invocation);
    if (!checked.ok) return checked;
    const requestedAt = this.#deps.clock.now();
    const { rotationGraceMilliseconds, rotationHardCapMilliseconds } = this.#limits;
    const deadline = this.#after(requestedAt, Math.max(rotationGraceMilliseconds, rotationHardCapMilliseconds));
    const requested = await this.#deps.registry.requestRotation(workerId, { requestedAt, deadline, ...invocation });
    if (!requested.ok) return requested.error.code === 'forbidden' ? err(notAuthorized()) : requested;
    return ok(Object.freeze({ workerId, credentialGeneration: requested.value.generation, deadline: requested.value.deadline }));
  }

  // The caller authenticated with the generation before the requested one;
  // the control plane signs a user JWT for the worker's own key.
  async renew(principal: WorkerPrincipal, request: CredentialRenewalRequest): Promise<Result<RenewedCredentials>> {
    const worker = await this.#activeWorker(principal.workerId);
    if (!worker.ok) return worker;
    const { rotation, current } = worker.value.credentials;
    const generation = request.credentialGeneration;
    if (rotation?.generation !== generation || principal.generation !== generation - 1) return err(rotationConflict('rotation-not-requested'));
    const stored = renewedAnswer(rotation, current, request);
    if (stored !== undefined) return stored;
    const signed = await this.#deps.broker.sign(this.#deps.installation, principal.workerId, generation, request.brokerUserPublicKey);
    if (!signed.ok) return signed;
    const next = Object.freeze({
      generation, controlPlaneHash: request.controlPlaneSecretSha256, brokerUserKey: request.brokerUserPublicKey, brokerIssuedAt: signed.value.issuedAt,
    });
    const renewed = await this.#deps.registry.renew(principal.workerId, next, signed.value.jwt, this.#deps.clock.now());
    if (!renewed.ok) return renewed.error.code === 'forbidden' ? err(notAuthorized()) : renewed;
    return ok(renewal(renewed.value));
  }

  // Drops the predecessor at once; the caller authenticated with the
  // generation it confirms, after its broker connection used it.
  async confirm(principal: WorkerPrincipal, generation: number): Promise<Result<ConfirmedCredentials>> {
    if (principal.generation !== generation) return err(rotationConflict('confirmation-mismatch'));
    const confirmed = await this.#deps.registry.confirm(principal.workerId, generation, this.#deps.clock.now());
    if (!confirmed.ok) return confirmed.error.code === 'forbidden' ? err(notAuthorized()) : confirmed;
    // The confirmation is committed; a failed publication is retried later.
    const revocationsPublished = confirmed.value ? await this.#publishedAfterCommit() : true;
    return ok(Object.freeze({ credentialGeneration: generation, revocationsPublished }));
  }

  // Denies every credential of the worker at once; with item 17's registry
  // its executions holding a live grant also become uncertain, never dead.
  async revoke(workerId: WorkerId): Promise<Result<WorkerRevocation>> {
    const revoked = await this.#deps.registry.revoke(workerId, this.#deps.clock.now());
    if (!revoked.ok) return revoked;
    // After the commit, which decides; a consumer left over does no harm.
    const removed = await this.#deps.commandConsumers.remove(workerId);
    const published = await this.publishRevocations();
    return published.ok ? ok(Object.freeze({ commandConsumerRemoved: removed.ok })) : published;
  }

  // Enforces rotation deadlines; the control plane runs it periodically,
  // which also retries an unpublished revocation. Answers how many it ended.
  async expireGraceWindows(): Promise<Result<number>> {
    const now = this.#deps.clock.now();
    const expired = await this.#deps.registry.expirePredecessors(now);
    if (!expired.ok) return expired;
    const revoked = await this.#revokeUnrenewed(now);
    if (!revoked.ok) return revoked;
    const published = await this.publishRevocations();
    if (!published.ok) return published;
    const kept = revoked.value.consumersKept;
    if (kept.length > 0) return err(consumersKept(kept));
    return ok(expired.value + revoked.value.revoked);
  }

  // Sends the broker the complete revocation list when part of it is new.
  publishRevocations(): Promise<Result<number>> {
    return this.#deps.registry.publishRevocations((revocations) => this.#deps.broker.publishRevocations(revocations));
  }

  // The worker and generation a presented control-plane bearer belongs to;
  // unknown, revoked, dropped, or past the deadline are alike `forbidden`.
  async authenticateWorkerBearer(secret: string): Promise<Result<WorkerPrincipal>> {
    const worker = await this.#deps.registry.workerByCredentialHash(this.#deps.secrets.hashOf(secret));
    if (!worker.ok) return worker;
    if (worker.value === undefined || worker.value.revokedAt !== undefined) return err(notAuthorized());
    const generations = validGenerations(worker.value.credentials, this.#deps.clock.now());
    const matched = generations.find((generation) => this.#deps.secrets.matches(secret, generation.controlPlaneHash));
    if (matched === undefined) return err(notAuthorized());
    return ok(Object.freeze({ workerId: worker.value.workerId, generation: matched.generation }));
  }

  // A thrown failure counts as an unpublished one: the entries stay recorded.
  async #publishedAfterCommit(): Promise<boolean> {
    try {
      return (await this.publishRevocations()).ok;
    } catch {
      return false;
    }
  }

  // Each worker whose rotation was never renewed by its deadline is revoked,
  // then its command consumer removed; a removal that fails is reported.
  async #revokeUnrenewed(now: Instant): Promise<Result<{ revoked: number; consumersKept: readonly WorkerId[] }>> {
    const due = await this.#deps.registry.unrenewedRotations(now);
    if (!due.ok) return due;
    let revoked = 0;
    const consumersKept: WorkerId[] = [];
    for (const workerId of due.value) {
      const expired = await this.#deps.registry.expireRotation(workerId, now);
      if (!expired.ok) return expired;
      if (!expired.value) continue;
      revoked += 1;
      if (!(await this.#deps.commandConsumers.remove(workerId)).ok) consumersKept.push(workerId);
    }
    return ok({ revoked, consumersKept });
  }

  async #activeWorker(workerId: WorkerId): Promise<Result<EnrolledWorker>> {
    const worker = await this.#deps.registry.worker(workerId);
    if (!worker.ok) return worker;
    if (worker.value === undefined) return err(failure('not-found', `no worker ${workerId} is enrolled`, { worker: workerId }));
    if (worker.value.revokedAt !== undefined) return err(notAuthorized());
    return ok(worker.value);
  }

  async #issueGeneration(workerId: WorkerId, generation: number): Promise<Result<{
    generation: CredentialGeneration;
    secrets: { controlPlane: string; broker: string };
  }>> {
    const broker = await this.#deps.broker.issue(this.#deps.installation, workerId, generation);
    if (!broker.ok) return broker;
    const controlPlane = this.#deps.secrets.issue('worker');
    return ok({
      generation: Object.freeze({
        generation, controlPlaneHash: controlPlane.hash, brokerUserKey: broker.value.userKey, brokerIssuedAt: broker.value.issuedAt,
      }),
      secrets: Object.freeze({ controlPlane: controlPlane.secret, broker: broker.value.creds }),
    });
  }

  #after(instant: Instant, milliseconds: number): Instant {
    const later = instantFromEpochMilliseconds(Date.parse(instant) + milliseconds);
    if (!later.ok) throw new RangeError(later.error.message);
    return later.value;
  }
}

function reasoned(code: 'forbidden' | 'precondition-failed' | 'conflict', reason: string, message: string) {
  return failure(code, message, { reason });
}

// A renewal repeated with the same material gets the stored answer.
function renewedAnswer(
  rotation: RotationRequest,
  current: CredentialGeneration,
  request: CredentialRenewalRequest,
): Result<RenewedCredentials> | undefined {
  if (rotation.brokerUserJwt === undefined) return undefined;
  const same = current.brokerUserKey === request.brokerUserPublicKey && current.controlPlaneHash === request.controlPlaneSecretSha256;
  return same ? ok(renewal(rotation)) : err(rotationConflict('renewal-mismatch'));
}

function renewal(rotation: RotationRequest): RenewedCredentials {
  return Object.freeze({ credentialGeneration: rotation.generation, brokerUserJwt: rotation.brokerUserJwt!, deadline: rotation.deadline });
}

function consumersKept(workers: readonly WorkerId[]) {
  const message = `the command consumer of revoked worker ${workers.join(', ')} was not removed; a control-plane start retries it`;
  return failure('unavailable', message, { workers: workers.join(',') });
}

function notAuthorized() {
  return reasoned('forbidden', 'worker-not-authorized', 'the worker credential is not valid');
}

// A broker user issued for an enrollment that failed is never handed out,
// so it grants nothing to anyone.
function enrollFailure(error: ReturnType<typeof failure>): Result<never> {
  if (error.details.reason === 'token-used' || error.details.reason === 'token-expired') {
    return err(reasoned('forbidden', 'token-invalid', 'the enrollment token was used or expired meanwhile'));
  }
  if (error.details.reason === 'journal-enrolled') return err(reasoned('conflict', 'journal-enrolled', 'the journal is already enrolled'));
  return err(error);
}

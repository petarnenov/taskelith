import { err, failure, instantFromEpochMilliseconds, ok, type Instant, type Result } from '@taskelith/kernel';
import type { Secrets } from '@taskelith/access';
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
} from '../domain/enrollment.js';
import { FLEET_LIMITS, type FleetLimits } from '../domain/fleet-limits.js';
import { parseWorkerId, type InstallationIdentity } from '../domain/installation.js';
import type { BrokerCredentials } from '../ports/broker-credentials.js';
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

export interface RotatedCredentials {
  readonly credentialGeneration: number;
  readonly credentials: { readonly controlPlane: string; readonly broker: string };
}

export interface EnrollmentServiceDependencies {
  readonly installation: InstallationIdentity;
  readonly serverProtocolVersions: ProtocolWindow;
  readonly registry: FleetRegistry;
  readonly secrets: Secrets;
  readonly ids: IdentifierSource;
  readonly broker: BrokerCredentials;
  readonly clock: Clock;
  readonly limits?: FleetLimits;
}

// Enrollment, rotation, revocation, and authentication (trust model sec. 4).
// A failure's `reason` maps to 401, 409, or 422 of `enrollWorker` (item 16).
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
    if (commonProtocolVersion(request.protocolVersions, this.#deps.serverProtocolVersions) === undefined) {
      return err(reasoned('precondition-failed', 'protocol-not-supported', 'no protocol version is supported by both sides'));
    }
    const workerId = parseWorkerId(this.#deps.ids.newWorkerId());
    if (!workerId.ok) return workerId;
    const issued = await this.#issueGeneration(workerId.value, 1);
    if (!issued.ok) return issued;
    const worker: EnrolledWorker = Object.freeze({
      workerId: workerId.value, journalId: request.journalId, host: request.host, protocolVersions: request.protocolVersions,
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

  // A new generation of both credentials; the old one stays valid only
  // within the grace window (trust model section 4).
  async rotate(workerId: WorkerId): Promise<Result<RotatedCredentials>> {
    const worker = await this.#activeWorker(workerId);
    if (!worker.ok) return worker;
    const { current } = worker.value.credentials;
    const issued = await this.#issueGeneration(workerId, current.generation + 1);
    if (!issued.ok) return issued;
    const now = this.#deps.clock.now();
    const validUntil = this.#after(now, this.#limits.rotationGraceMilliseconds);
    const rotated = await this.#deps.registry.rotate(workerId, current.generation, issued.value.generation, validUntil, now);
    if (!rotated.ok) return rotated.error.code === 'forbidden' ? err(notAuthorized()) : rotated;
    // A dropped predecessor stays recorded until a later publication succeeds.
    await this.publishRevocations();
    return ok({ credentialGeneration: issued.value.generation.generation, credentials: issued.value.secrets });
  }

  // Denies every credential of the worker at once; its active attempts
  // become uncertain through reconciliation (item 21), never dead.
  async revoke(workerId: WorkerId): Promise<Result<void>> {
    const revoked = await this.#deps.registry.revoke(workerId, this.#deps.clock.now());
    if (!revoked.ok) return revoked;
    const published = await this.publishRevocations();
    return published.ok ? ok(undefined) : published;
  }

  // Ends the grace windows that have passed; the control plane runs it
  // periodically, which also retries an unpublished revocation.
  async expireGraceWindows(): Promise<Result<number>> {
    const expired = await this.#deps.registry.expirePredecessors(this.#deps.clock.now());
    if (!expired.ok) return expired;
    const published = await this.publishRevocations();
    return published.ok ? expired : published;
  }

  // Sends the broker the complete revocation list when part of it is new.
  publishRevocations(): Promise<Result<number>> {
    return this.#deps.registry.publishRevocations((revocations) => this.#deps.broker.publishRevocations(revocations));
  }

  // The generation a presented control-plane secret belongs to; a revoked
  // worker, or one past the grace window, is `forbidden`.
  async authenticate(workerId: WorkerId, secret: string): Promise<Result<number>> {
    const worker = await this.#activeWorker(workerId);
    if (!worker.ok) return worker.error.code === 'not-found' ? err(notAuthorized()) : worker;
    const generations = validGenerations(worker.value.credentials, this.#deps.clock.now());
    const matched = generations.find((generation) => this.#deps.secrets.matches(secret, generation.controlPlaneHash));
    return matched === undefined ? err(notAuthorized()) : ok(matched.generation);
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
      generation: Object.freeze({ generation, controlPlaneHash: controlPlane.hash, brokerUserKey: broker.value.userKey }),
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

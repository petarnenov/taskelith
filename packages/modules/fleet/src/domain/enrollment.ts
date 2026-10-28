import { err, ok, type Instant, type Result } from '@taskelith/kernel';
import type { SecretHash } from '@taskelith/access';
import type { JournalId, WorkerId } from '@taskelith/execution';
import type { HardControl } from '@taskelith/scheduling';

export type HostPlatform = 'linux' | 'darwin';
export type HostArchitecture = 'x64' | 'arm64';

export interface WorkerHost {
  readonly platform: HostPlatform;
  readonly architecture: HostArchitecture;
  readonly hostname: string;
}

// What the owner binds a token to; an absent field accepts any host.
export interface HostConstraints {
  readonly platform?: HostPlatform;
  readonly architecture?: HostArchitecture;
  readonly hostname?: string;
}

// A short-lived, single-use enrollment token (trust model section 4); only
// its hash is stored.
export interface EnrollmentToken {
  readonly hash: SecretHash;
  readonly issuedAt: Instant;
  readonly expiresAt: Instant;
  readonly constraints: HostConstraints;
}

export interface ProtocolWindow {
  readonly minimum: number;
  readonly maximum: number;
}

export interface WorkerCapacity {
  readonly slots: number;
  readonly cpuMillicores: number;
  readonly memoryMebibytes: number;
  readonly controls: readonly HardControl[];
}

export interface EnrollmentRequest {
  readonly journalId: JournalId;
  readonly host: WorkerHost;
  readonly protocolVersions: ProtocolWindow;
  readonly capacity: WorkerCapacity;
}

// One generation of a worker's credentials: the hash of its control-plane
// bearer secret and the public key of its broker user.
export interface CredentialGeneration {
  readonly generation: number;
  readonly controlPlaneHash: SecretHash;
  readonly brokerUserKey: string;
  // When the broker user's JWT was issued; a revocation must not be earlier.
  readonly brokerIssuedAt: Instant;
}

// A rotation that `rotate-worker` requested: generation `generation`, which
// must be confirmed by `deadline`; the renewal adds the JWT it signed.
export interface RotationRequest {
  readonly generation: number;
  readonly requestedAt: Instant;
  readonly deadline: Instant;
  readonly brokerUserJwt?: string;
}

// The predecessor stays valid until its successor is confirmed or
// `validUntil`, the rotation's deadline (installation contract sec. 6).
export interface WorkerCredentials {
  readonly current: CredentialGeneration;
  readonly previous?: CredentialGeneration & { readonly validUntil: Instant };
  readonly rotation?: RotationRequest;
}

export interface EnrolledWorker {
  readonly workerId: WorkerId;
  readonly journalId: JournalId;
  readonly host: WorkerHost;
  readonly protocolVersions: ProtocolWindow;
  // The highest version the worker and the control plane share, which the
  // control plane stamps on the worker's commands (wire contracts, section 3).
  readonly protocolVersion: number;
  readonly capacity: WorkerCapacity;
  readonly credentials: WorkerCredentials;
  readonly enrolledAt: Instant;
  readonly revokedAt?: Instant;
}

// The field of the host that a token's constraints do not allow, if any.
export function hostMismatch(constraints: HostConstraints, host: WorkerHost): keyof WorkerHost | undefined {
  const fields: Array<keyof WorkerHost> = ['platform', 'architecture', 'hostname'];
  return fields.find((field) => constraints[field] !== undefined && constraints[field] !== host[field]);
}

export function isExpired(token: EnrollmentToken, now: Instant): boolean {
  return Date.parse(now) >= Date.parse(token.expiresAt);
}

// The highest version both windows contain, as the control plane stamps it on
// commands (execution wire contracts, section 3).
export function commonProtocolVersion(worker: ProtocolWindow, server: ProtocolWindow): number | undefined {
  const highest = Math.min(worker.maximum, server.maximum);
  return highest >= Math.max(worker.minimum, server.minimum) ? highest : undefined;
}

// A broker user to revoke, from the time it stopped being valid; NATS voids
// its JWTs issued at or before that time.
export interface BrokerRevocation {
  readonly userKey: string;
  readonly revokedAt: Instant;
}

// Why a renewal or a confirmation does not apply to the stored credentials.
export type RotationConflict = 'rotation-not-requested' | 'renewal-mismatch' | 'confirmation-mismatch';

// An open rotation is kept, so a repeated request changes nothing.
export function requestRotation(credentials: WorkerCredentials, requestedAt: Instant, deadline: Instant): WorkerCredentials {
  if (credentials.rotation !== undefined) return credentials;
  const rotation = Object.freeze({ generation: credentials.current.generation + 1, requestedAt, deadline });
  return Object.freeze({ ...credentials, rotation });
}

// `next` becomes current and the current one its predecessor until the
// deadline; the same key and hash again leave the credentials unchanged.
export function renewCredentials(
  credentials: WorkerCredentials,
  next: CredentialGeneration,
  brokerUserJwt: string,
): Result<WorkerCredentials, RotationConflict> {
  const { rotation, current } = credentials;
  if (rotation === undefined || rotation.generation !== next.generation) return err('rotation-not-requested');
  if (rotation.brokerUserJwt !== undefined) {
    const same = current.brokerUserKey === next.brokerUserKey && current.controlPlaneHash === next.controlPlaneHash;
    return same ? ok(credentials) : err('renewal-mismatch');
  }
  const previous = Object.freeze({ ...current, validUntil: rotation.deadline });
  return ok(Object.freeze({ current: next, previous, rotation: Object.freeze({ ...rotation, brokerUserJwt }) }));
}

export interface Confirmation {
  readonly credentials: WorkerCredentials;
  // The predecessor the confirmation drops; none for a repeat.
  readonly dropped?: CredentialGeneration;
}

// Confirms the renewed current generation, or repeats a confirmed one.
export function confirmCredentials(credentials: WorkerCredentials, generation: number): Result<Confirmation, RotationConflict> {
  const { current, previous, rotation } = credentials;
  if (current.generation !== generation) return err('confirmation-mismatch');
  if (rotation?.brokerUserJwt === undefined || previous === undefined) return ok({ credentials });
  const { validUntil: _deadline, ...dropped } = previous;
  return ok({ credentials: Object.freeze({ current }), dropped });
}

// A requested rotation whose deadline passed before the worker renewed it.
export function unrenewedPastDeadline(credentials: WorkerCredentials, now: Instant): boolean {
  const { rotation } = credentials;
  return rotation !== undefined && rotation.brokerUserJwt === undefined && Date.parse(rotation.deadline) <= Date.parse(now);
}

// Every generation of the worker, current and predecessor.
export function credentialGenerations(credentials: WorkerCredentials): readonly CredentialGeneration[] {
  const { current, previous } = credentials;
  return previous === undefined ? [current] : [current, previous];
}

// A revocation from `at`, but never before the user's JWT was issued, since
// NATS voids only the JWTs issued up to the revocation time.
export function revocationOf(generation: CredentialGeneration, at: Instant): BrokerRevocation {
  const revokedAt = Date.parse(at) >= Date.parse(generation.brokerIssuedAt) ? at : generation.brokerIssuedAt;
  return Object.freeze({ userKey: generation.brokerUserKey, revokedAt });
}

// Who a valid control-plane bearer belongs to, and the generation it is of.
export interface WorkerPrincipal {
  readonly workerId: WorkerId;
  readonly generation: number;
}

// The predecessor whose deadline has passed by `now`, if any; every
// registry's sweep expires exactly this one, with its rotation.
export function expiredPredecessor(credentials: WorkerCredentials, now: Instant): WorkerCredentials['previous'] {
  const previous = credentials.previous;
  return previous !== undefined && Date.parse(previous.validUntil) <= Date.parse(now) ? previous : undefined;
}

// The generations a presented secret may still use at `now`.
export function validGenerations(credentials: WorkerCredentials, now: Instant): readonly CredentialGeneration[] {
  const previous = credentials.previous;
  const graceOpen = previous !== undefined && Date.parse(now) < Date.parse(previous.validUntil);
  return graceOpen ? [credentials.current, previous] : [credentials.current];
}

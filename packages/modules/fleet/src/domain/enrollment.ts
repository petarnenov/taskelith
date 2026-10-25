import type { Instant } from '@taskelith/kernel';
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
}

// The predecessor stays valid until `validUntil`, the end of the rotation's
// grace window (trust model section 4).
export interface WorkerCredentials {
  readonly current: CredentialGeneration;
  readonly previous?: CredentialGeneration & { readonly validUntil: Instant };
}

export interface EnrolledWorker {
  readonly workerId: WorkerId;
  readonly journalId: JournalId;
  readonly host: WorkerHost;
  readonly protocolVersions: ProtocolWindow;
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

// A rotation keeps the current generation as the predecessor until the end
// of the grace window; an older predecessor is dropped.
export function rotateCredentials(credentials: WorkerCredentials, next: CredentialGeneration, validUntil: Instant): WorkerCredentials {
  return Object.freeze({ current: next, previous: Object.freeze({ ...credentials.current, validUntil }) });
}

// The generations a presented secret may still use at `now`.
export function validGenerations(credentials: WorkerCredentials, now: Instant): readonly CredentialGeneration[] {
  const previous = credentials.previous;
  const graceOpen = previous !== undefined && Date.parse(now) < Date.parse(previous.validUntil);
  return graceOpen ? [credentials.current, previous] : [credentials.current];
}

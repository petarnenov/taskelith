import { err, failure, ok, parseIdentifier, type Identifier, type Result } from '@taskelith/kernel';
import { parseRecoveryEpoch, type InstallationId, type RecoveryEpoch, type WorkerId } from '@taskelith/execution';

// The identity an installation gets once, at explicit initialization (trust
// model section 2); the epoch changes only through disaster recovery (G6).
export interface InstallationIdentity {
  readonly installationId: InstallationId;
  readonly recoveryEpoch: RecoveryEpoch;
}

export const FIRST_RECOVERY_EPOCH = 1;

// Identifiers become NATS subject tokens and stream names, so they may hold
// only these characters (execution wire contracts, section 2).
const SUBJECT_TOKEN = /^[A-Za-z0-9_-]{1,64}$/;

export function parseInstallationId(text: string): Result<InstallationId> {
  return parseToken('InstallationId', text);
}

export function parseWorkerId(text: string): Result<WorkerId> {
  return parseToken('WorkerId', text);
}

export function installationIdentity(installationId: string, recoveryEpoch: number): Result<InstallationIdentity> {
  const id = parseInstallationId(installationId);
  if (!id.ok) return id;
  const epoch = parseRecoveryEpoch(recoveryEpoch);
  if (!epoch.ok) return epoch;
  return ok(Object.freeze({ installationId: id.value, recoveryEpoch: epoch.value }));
}

export function isSameInstallation(left: InstallationIdentity, right: InstallationIdentity): boolean {
  return left.installationId === right.installationId && left.recoveryEpoch === right.recoveryEpoch;
}

function parseToken<Kind extends string>(kind: Kind, text: string): Result<Identifier<Kind>> {
  if (!SUBJECT_TOKEN.test(text)) return err(failure('invalid', `${kind} must be 1-64 letters, digits, '_' or '-'`, { kind }));
  return parseIdentifier(kind, text);
}

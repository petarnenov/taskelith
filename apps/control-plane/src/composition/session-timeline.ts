import { randomUUID } from 'node:crypto';
import { SessionInputDigestKeyFile, type ControlPlaneNamespace } from '@taskelith/control-plane-store';
import { SessionTimelineService, type TurnId } from '@taskelith/execution';
import { ok, parseIdentifier, type Result } from '@taskelith/kernel';
import { PostgresSessionTimelineStore, type PostgresDatabase } from '@taskelith/postgres';
import { HmacInputDigest, SecretTextRedactor } from '@taskelith/secrets';

// The session timeline service over PostgreSQL; a missing or malformed
// digest key refuses the start (coordinator answer Q4).
export function startSessionTimelineService(namespace: ControlPlaneNamespace, database: PostgresDatabase): Result<SessionTimelineService> {
  const key = new SessionInputDigestKeyFile(namespace).read();
  if (!key.ok) return key;
  const digest = HmacInputDigest.fromKey(key.value);
  if (!digest.ok) return digest;
  return ok(new SessionTimelineService({
    store: new PostgresSessionTimelineStore(database),
    digest: digest.value,
    redactor: new SecretTextRedactor(),
    turnIds: { next: randomTurnId },
  }));
}

function randomTurnId(): TurnId {
  const id = parseIdentifier('TurnId', randomUUID());
  if (!id.ok) throw new RangeError(id.error.message);
  return id.value;
}

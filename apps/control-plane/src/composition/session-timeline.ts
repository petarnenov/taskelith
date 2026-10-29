import { randomBytes } from 'node:crypto';
import { SessionInputDigestKeyFile, SessionOutputTailKeyFile, type ControlPlaneNamespace } from '@taskelith/control-plane-store';
import {
  BEFORE_ANY_EVENT,
  NativeRequestSource,
  SessionTimelineService,
  parseTurnId,
  type NeedsYouItemId,
  type NeedsYouSourceId,
  type SessionScopes,
  type TurnId,
  type ViewPositions,
} from '@taskelith/execution';
import { ok, parseIdentifier, type Result } from '@taskelith/kernel';
import { PostgresSessionScopes, PostgresSessionTimelineStore, type PostgresDatabase } from '@taskelith/postgres';
import type { Clock } from '@taskelith/sdlc';
import { HmacInputDigest, SecretOutputRedactor, SecretTextRedactor, outputTailCipher } from '@taskelith/secrets';

export const NATIVE_REQUEST_SOURCE_ID = 'native-requests' as NeedsYouSourceId;

// What the agent session operations and the inbox reach.
export interface AgentSessionServices {
  readonly timeline: SessionTimelineService;
  readonly scopes: SessionScopes;
  readonly positions: ViewPositions;
  readonly clock: Clock;
  // Built for item 15, which registers it with the inbox.
  readonly source: NativeRequestSource;
}

// The session timeline over PostgreSQL; a missing or malformed digest or
// tail key refuses the start (answer Q4 of 13a, answer Q2 of 13d).
export function startAgentSessionServices(namespace: ControlPlaneNamespace, database: PostgresDatabase, clock: Clock): Result<AgentSessionServices> {
  const key = new SessionInputDigestKeyFile(namespace).read();
  if (!key.ok) return key;
  const digest = HmacInputDigest.fromKey(key.value);
  if (!digest.ok) return digest;
  const tailKey = new SessionOutputTailKeyFile(namespace).read();
  if (!tailKey.ok) return tailKey;
  const tailCipher = outputTailCipher(tailKey.value);
  if (!tailCipher.ok) return tailCipher;
  const store = new PostgresSessionTimelineStore(database);
  const timeline = new SessionTimelineService({
    store, digest: digest.value, redactor: new SecretTextRedactor(), outputRedactor: new SecretOutputRedactor(), tailCipher: tailCipher.value,
    turnIds: { next: mintTurnId }, clock, itemIds: { next: mintItemId },
  });
  const source = new NativeRequestSource({ id: NATIVE_REQUEST_SOURCE_ID, store, timeline, digest: digest.value, clock, positions: BEFORE_ANY_EVENT });
  return ok({ timeline, scopes: new PostgresSessionScopes(database), positions: BEFORE_ANY_EVENT, clock, source });
}

// `t` and 32 lowercase hexadecimal digits from 128 random bits (wire
// contracts, section 6).
export function mintTurnId(): TurnId {
  return mustParse(parseTurnId(`t${randomBytes(16).toString('hex')}`));
}

function mintItemId(): NeedsYouItemId {
  return mustParse(parseIdentifier('NeedsYouItemId', `n${randomBytes(16).toString('hex')}`));
}

function mustParse<Value>(parsed: Result<Value>): Value {
  if (!parsed.ok) throw new RangeError(parsed.error.message);
  return parsed.value;
}

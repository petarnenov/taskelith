import { randomBytes } from 'node:crypto';
import { SessionInputDigestKeyFile, SessionOutputTailKeyFile, type ControlPlaneNamespace } from '@taskelith/control-plane-store';
import {
  NATIVE_REQUEST_SOURCE_ID,
  NativeRequestSource,
  SessionTimelineService,
  parseTurnId,
  type InputDigest,
  type NeedsYouItemId,
  type NeedsYouSource,
  type SessionTimelineStore,
  type SessionTimelineTransaction,
  type SessionScopes,
  type TurnId,
  type ViewPositions,
} from '@taskelith/execution';
import { ok, parseIdentifier, type Result } from '@taskelith/kernel';
import { PostgresSessionScopes, PostgresSessionTimelineStore, PostgresUiEventLog, type PostgresDatabase } from '@taskelith/postgres';
import type { Clock } from '@taskelith/sdlc';
import { HmacInputDigest, SecretOutputRedactor, SecretTextRedactor, outputTailCipher } from '@taskelith/secrets';
import { LogViewPositions } from '../application/event-log-keeper.js';

// The timeline's own source of items, which its events name.
export { NATIVE_REQUEST_SOURCE_ID };

// What the agent session operations and the inbox reach.
export interface AgentSessionServices {
  readonly timeline: SessionTimelineService;
  readonly scopes: SessionScopes;
  readonly positions: ViewPositions;
  readonly clock: Clock;
  // The keyed digest of session input, which inbox answers share.
  readonly digest: InputDigest;
  // Built for item 15, which registers it with the inbox.
  readonly source: NativeRequestSource;
  // The same source over one transaction's timeline, which a view reads
  // and an inbox answer writes.
  sourceIn(transaction: SessionTimelineTransaction, positions: ViewPositions): NeedsYouSource;
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
  const timelineOver = (over: SessionTimelineStore) => new SessionTimelineService({
    store: over, digest: digest.value, redactor: new SecretTextRedactor(), outputRedactor: new SecretOutputRedactor(),
    tailCipher: tailCipher.value, turnIds: { next: mintTurnId }, clock, itemIds: { next: mintItemId },
  });
  const timeline = timelineOver(store);
  const positions = new LogViewPositions(new PostgresUiEventLog(database));
  const source = new NativeRequestSource({ id: NATIVE_REQUEST_SOURCE_ID, store, timeline, digest: digest.value, clock, positions });
  const sourceIn = (transaction: SessionTimelineTransaction, snapshotPositions: ViewPositions) => {
    const bound: SessionTimelineStore = { transaction: (work) => work(transaction) };
    return new NativeRequestSource({
      id: NATIVE_REQUEST_SOURCE_ID, timeline: timelineOver(bound), digest: digest.value, clock, store: bound, positions: snapshotPositions,
    });
  };
  return ok({ timeline, scopes: new PostgresSessionScopes(database), positions, clock, digest: digest.value, source, sourceIn });
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

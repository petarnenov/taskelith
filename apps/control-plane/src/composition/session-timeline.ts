import { createHash, randomBytes } from 'node:crypto';
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
import type { Logger } from '@taskelith/observability';
import type { Clock, TaskId } from '@taskelith/sdlc';
import { HmacInputDigest, SecretOutputRedactor, SecretTextRedactor, outputTailCipher } from '@taskelith/secrets';
import { taskBranchName } from '@taskelith/workspace';
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
  // The timeline over one transaction, which a session observation's
  // change shares with its inbox row and cursor.
  timelineIn(transaction: SessionTimelineTransaction): SessionTimelineService;
  // The ref a standing rule's push is checked against; a test pins it.
  taskBranchRef(taskId: TaskId): string;
}

// The session timeline over PostgreSQL; a missing or malformed digest or
// tail key refuses the start (answer Q4 of 13a, answer Q2 of 13d).
export function startAgentSessionServices(
  namespace: ControlPlaneNamespace, database: PostgresDatabase, clock: Clock, logger: Logger,
): Result<AgentSessionServices> {
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
    commandIdDigest: sessionCommandDigest, taskBranchRef,
    commandLog: { turnWithoutReader: (fields) => logger.warn('execution.session-command.no-reader', { ...fields }) },
  });
  const timeline = timelineOver(store);
  const positions = new LogViewPositions(new PostgresUiEventLog(database));
  const source = new NativeRequestSource({ id: NATIVE_REQUEST_SOURCE_ID, store, timeline, digest: digest.value, clock, positions });
  const sourceIn = (transaction: SessionTimelineTransaction, snapshotPositions: ViewPositions) => {
    const bound = boundTo(transaction);
    return new NativeRequestSource({
      id: NATIVE_REQUEST_SOURCE_ID, timeline: timelineOver(bound), digest: digest.value, clock, store: bound, positions: snapshotPositions,
    });
  };
  const timelineIn = (transaction: SessionTimelineTransaction) => timelineOver(boundTo(transaction));
  return ok({ timeline, scopes: new PostgresSessionScopes(database), positions, clock, digest: digest.value, source, sourceIn, timelineIn, taskBranchRef });
}

// The same digest as the workspace's task branch; a test pins that.
const sessionCommandDigest = (identifier: string): string => createHash('sha256').update(identifier, 'utf8').digest('hex');

// Worker messages section 9: the branch's full ref, as the worker pushes it.
function taskBranchRef(taskId: TaskId): string {
  return `refs/heads/${taskBranchName(taskId, sessionCommandDigest)}`;
}

// A store whose every transaction is the given one, already open.
function boundTo(transaction: SessionTimelineTransaction): SessionTimelineStore {
  return { transaction: (work) => work(transaction) };
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

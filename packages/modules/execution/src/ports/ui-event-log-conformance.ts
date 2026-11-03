import { parseIdentifier, type Instant, type Result } from '@taskelith/kernel';
import { expectRead, expectSame, type ConformanceCase, type ProjectId } from '@taskelith/sdlc';
import type { PrincipalId, SessionId, TurnId } from '../domain/identifiers.js';
import type { CommittedEntry, LoggedEntry, StreamFilter, UiEventLog } from './ui-event-log.js';
import { INSTALLATION_SCOPE, projectScope, type UiEvent } from './ui-events.js';

// One adapter's log and a way to commit entries to it, each call in a
// transaction of its own, in call order.
export interface UiEventLogFixture {
  readonly log: UiEventLog;
  commit(entries: readonly CommittedEntry[]): Promise<void>;
}

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`conformance fixture: ${result.error.message}`);
  return result.value;
}

const ALPHA = 'alpha' as ProjectId;
const BETA = 'beta' as ProjectId;
const PERSON = must(parseIdentifier('PrincipalId', 'u-person')) as PrincipalId;
const OTHER = must(parseIdentifier('PrincipalId', 'u-other')) as PrincipalId;
const EARLY = '2026-11-03T08:00:00.000Z' as Instant;
const LATE = '2026-11-03T09:00:00.000Z' as Instant;
const LATER = '2026-11-03T10:00:00.000Z' as Instant;

// An `output-appended` event of `project` whose entry position is `mark`.
function event(projectId: ProjectId | undefined, mark: number): CommittedEntry {
  const sessionId = 's-1' as SessionId;
  const entry = { position: mark, turnId: 't-1' as TurnId, generation: 1, text: `entry ${mark}` } as never;
  const uiEvent: UiEvent = {
    scope: projectId === undefined ? INSTALLATION_SCOPE : projectScope(projectId), occurredAt: EARLY,
    record: { type: 'output-appended', sessionId, entry },
  };
  return { kind: 'event', event: uiEvent };
}

function rolesChanged(principalId: PrincipalId, projectId?: ProjectId): CommittedEntry {
  return { kind: 'principal-change', change: { change: 'roles-changed', principalId, ...(projectId === undefined ? {} : { projectId }) } };
}

// Each read entry as its position and either its entry mark or its change.
function marks(entries: readonly LoggedEntry[]): readonly string[] {
  return entries.map((entry) => entry.kind === 'event'
    ? `${entry.position}:${(entry.event.record as { entry: { position: number } }).entry.position}`
    : `${entry.position}:${entry.change.change}`);
}

async function read(log: UiEventLog, after: number, through: number, filter: StreamFilter, limit = 100): Promise<readonly string[]> {
  return marks(must(await log.readAfter(after, through, filter, limit)));
}

const ALPHA_STREAM: StreamFilter = { scope: projectScope(ALPHA), principalId: PERSON };

export const UI_EVENT_LOG_CONFORMANCE: readonly ConformanceCase<UiEventLogFixture>[] = Object.freeze([
  {
    name: 'an empty log has floor and head 0, and committed entries are numbered from 1 in commit order',
    async check({ log, commit }) {
      const problems: string[] = [];
      expectRead(problems, 'empty bounds', await log.bounds(), { floor: 0, head: 0 });
      await commit([event(ALPHA, 1), event(ALPHA, 2)]);
      await commit([event(ALPHA, 3)]);
      expectRead(problems, 'unnumbered bounds', await log.bounds(), { floor: 0, head: 0 });
      expectSame(problems, 'nothing readable before numbering', await read(log, 0, 10, ALPHA_STREAM), []);
      expectRead(problems, 'numbered', await log.assign(100, EARLY), 3);
      expectRead(problems, 'bounds', await log.bounds(), { floor: 0, head: 3 });
      expectSame(problems, 'order', await read(log, 0, 3, ALPHA_STREAM), ['1:1', '2:2', '3:3']);
      return problems;
    },
  },
  {
    name: 'a position is assigned once and never reused, and a limit numbers only the oldest entries',
    async check({ log, commit }) {
      const problems: string[] = [];
      await commit([event(ALPHA, 1), event(ALPHA, 2), event(ALPHA, 3)]);
      expectRead(problems, 'first two', await log.assign(2, EARLY), 2);
      expectRead(problems, 'nothing left twice', await log.assign(2, EARLY), 1);
      expectRead(problems, 'nothing left', await log.assign(2, EARLY), 0);
      await commit([event(ALPHA, 4)]);
      expectRead(problems, 'the new one', await log.assign(10, EARLY), 1);
      expectSame(problems, 'positions', await read(log, 0, 10, ALPHA_STREAM), ['1:1', '2:2', '3:3', '4:4']);
      return problems;
    },
  },
  {
    name: 'a read returns its scope and its principal changes after the cursor through the bound, at most the limit',
    async check({ log, commit }) {
      const problems: string[] = [];
      await commit([event(ALPHA, 1), event(BETA, 2), event(undefined, 3), rolesChanged(PERSON, ALPHA), rolesChanged(OTHER), event(ALPHA, 6)]);
      must(await log.assign(100, EARLY));
      expectSame(problems, 'project alpha', await read(log, 0, 6, ALPHA_STREAM), ['1:1', '4:roles-changed', '6:6']);
      expectSame(problems, 'installation', await read(log, 0, 6, { scope: INSTALLATION_SCOPE, principalId: OTHER }), ['3:3', '5:roles-changed']);
      expectSame(problems, 'no principal', await read(log, 0, 6, { scope: projectScope(BETA) }), ['2:2']);
      expectSame(problems, 'after and through', await read(log, 1, 5, ALPHA_STREAM), ['4:roles-changed']);
      expectSame(problems, 'limit', await read(log, 0, 6, ALPHA_STREAM, 2), ['1:1', '4:roles-changed']);
      return problems;
    },
  },
  {
    name: 'a prune removes entries numbered before the instant, oldest first up to the limit, and raises the floor',
    async check({ log, commit }) {
      const problems: string[] = [];
      await commit([event(ALPHA, 1), event(ALPHA, 2)]);
      must(await log.assign(100, EARLY));
      await commit([event(ALPHA, 3)]);
      must(await log.assign(100, LATE));
      await commit([event(ALPHA, 4)]);
      expectRead(problems, 'one of two', await log.prune(LATE, 1), 1);
      expectRead(problems, 'the other', await log.prune(LATE, 10), 2);
      expectRead(problems, 'nothing more', await log.prune(LATE, 10), 2);
      expectRead(problems, 'bounds', await log.bounds(), { floor: 2, head: 3 });
      expectSame(problems, 'kept', await read(log, 0, 3, ALPHA_STREAM), ['3:3']);
      expectRead(problems, 'unnumbered stays', await log.prune(LATER, 10), 3);
      expectRead(problems, 'numbered after the prune', await log.assign(100, LATER), 1);
      expectSame(problems, 'the unnumbered entry', await read(log, 3, 4, ALPHA_STREAM), ['4:4']);
      return problems;
    },
  },
]);

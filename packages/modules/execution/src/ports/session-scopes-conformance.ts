import { parseIdentifier, type Result } from '@taskelith/kernel';
import { expectRead, type ConformanceCase, type ProjectId, type TaskId, type WorkflowRunId } from '@taskelith/sdlc';
import type { SessionId } from '../domain/identifiers.js';
import { openSession } from '../domain/session-records.js';
import type { SessionScope, SessionScopes } from './session-scopes.js';
import type { SessionTimelineStore } from './session-timeline-store.js';

// A run of Scheduling's catalog with its project.
export interface LineageRun {
  readonly runId: string;
  readonly projectId: string;
}

// A task of Scheduling's task lineage: its root task, depth, and run.
export interface LineageTask {
  readonly taskId: string;
  readonly parentTaskId?: string;
  readonly rootTaskId: string;
  readonly depth: number;
  readonly projectId: string;
  readonly runId: string;
}

export interface ScopesLineage {
  readonly runs: readonly LineageRun[];
  readonly tasks: readonly LineageTask[];
}

// The lineage each adapter seeds before every case: alpha's card `run-alpha`
// holds `task-1` and its delegated child `task-child`, run in `run-child`;
// alpha's card `run-empty` has no task, and `run-beta` is beta's card.
export const SCOPES_LINEAGE: ScopesLineage = Object.freeze({
  runs: Object.freeze([
    { runId: 'run-alpha', projectId: 'alpha' }, { runId: 'run-child', projectId: 'alpha' },
    { runId: 'run-empty', projectId: 'alpha' }, { runId: 'run-beta', projectId: 'beta' },
  ]),
  tasks: Object.freeze([
    { taskId: 'task-1', rootTaskId: 'task-1', depth: 0, projectId: 'alpha', runId: 'run-alpha' },
    { taskId: 'task-child', parentTaskId: 'task-1', rootTaskId: 'task-1', depth: 1, projectId: 'alpha', runId: 'run-child' },
    { taskId: 'task-beta', rootTaskId: 'task-beta', depth: 0, projectId: 'beta', runId: 'run-beta' },
  ]),
});

// The scopes and the store of one adapter over SCOPES_LINEAGE, no session.
export interface SessionScopesFixture {
  readonly scopes: SessionScopes;
  readonly store: SessionTimelineStore;
}

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`conformance fixture: ${result.error.message}`);
  return result.value;
}

const sessionId = (text: string) => must(parseIdentifier('SessionId', text)) as SessionId;
const card = (projectId: string, runId: string): SessionScope => ({
  projectId: must(parseIdentifier('ProjectId', projectId)) as ProjectId, runId: must(parseIdentifier('RunId', runId)) as WorkflowRunId,
});

async function openSessions(store: SessionTimelineStore, sessions: readonly (readonly [string, string])[]): Promise<void> {
  for (const [name, task] of sessions) {
    const opened = openSession({
      id: sessionId(name), taskId: must(parseIdentifier('TaskId', task)) as TaskId, harness: must(parseIdentifier('HarnessPluginId', 'harness-a')),
    });
    must(await store.transaction((tx) => tx.sessions.add(opened)));
  }
}

export const SESSION_SCOPES_CONFORMANCE: readonly ConformanceCase<SessionScopesFixture>[] = Object.freeze([
  {
    name: 'a session\'s scope is its project and its lineage root\'s run, also of a delegated child, and none without a lineage',
    async check({ scopes, store }) {
      const problems: string[] = [];
      await openSessions(store, [['session-root', 'task-1'], ['session-child', 'task-child'], ['session-orphan', 'task-none']]);
      const alpha = card('alpha', 'run-alpha');
      expectRead(problems, 'root', await scopes.scopeOf(sessionId('session-root')), alpha);
      expectRead(problems, 'child', await scopes.scopeOf(sessionId('session-child')), alpha);
      expectRead(problems, 'orphan', await scopes.scopeOf(sessionId('session-orphan')), undefined);
      expectRead(problems, 'unknown', await scopes.scopeOf(sessionId('session-none')), undefined);
      expectRead(problems, 'in a transaction', await store.transaction((tx) => tx.scopes.scopeOf(sessionId('session-child'))), alpha);
      return problems;
    },
  },
  {
    name: 'a card is a root run of the project, also without sessions; a child run, another project\'s run, and an unknown run are none',
    async check({ scopes, store }) {
      const problems: string[] = [];
      for (const [name, expected] of [['run-alpha', true], ['run-empty', true], ['run-child', false], ['run-beta', false], ['run-none', false]] as const) {
        const { projectId, runId } = card('alpha', name);
        expectRead(problems, name, await scopes.isCard(projectId, runId), expected);
      }
      const empty = card('alpha', 'run-empty');
      expectRead(problems, 'in a transaction', await store.transaction((tx) => tx.scopes.isCard(empty.projectId, empty.runId)), true);
      return problems;
    },
  },
  {
    name: 'a card lists the sessions of its tasks and their delegated children in code-unit order, after a key, to a limit',
    async check({ scopes, store }) {
      const problems: string[] = [];
      await openSessions(store, [['session-b', 'task-1'], ['Session-c', 'task-child'], ['session-a', 'task-1'], ['session-z', 'task-beta']]);
      const alpha = card('alpha', 'run-alpha');
      expectRead(problems, 'all', await scopes.listByCard(alpha, undefined, 10), ['Session-c', 'session-a', 'session-b']);
      expectRead(problems, 'after', await scopes.listByCard(alpha, sessionId('session-a'), 10), ['session-b']);
      expectRead(problems, 'limit', await scopes.listByCard(alpha, undefined, 2), ['Session-c', 'session-a']);
      expectRead(problems, 'empty card', await scopes.listByCard(card('alpha', 'run-empty'), undefined, 10), []);
      expectRead(problems, 'in a transaction', await store.transaction((tx) => tx.scopes.listByCard(alpha, undefined, 1)), ['Session-c']);
      return problems;
    },
  },
]);

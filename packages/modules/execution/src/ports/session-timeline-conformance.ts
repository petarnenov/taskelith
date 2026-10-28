import { parseIdentifier, parseInstant, type Result } from '@taskelith/kernel';
import {
  FIRST_OWNERSHIP_GENERATION,
  expectCode,
  expectOneWinner,
  expectRead,
  expectSame,
  expectSuccess,
  parseEvidenceReference,
  type ConformanceCase,
  type TaskId,
} from '@taskelith/sdlc';
import { MAX_HARNESS_TEXT_LENGTH } from '../domain/harness-values.js';
import { FIRST_SESSION_GENERATION, type IdempotencyKey, type SessionId } from '../domain/identifiers.js';
import { bindAttempt, endGeneration, startGeneration } from '../domain/session-attempts.js';
import { recordLimitSignal, writeHandoff } from '../domain/session-handoff.js';
import { appendOutput } from '../domain/session-output.js';
import { openSession, type Session } from '../domain/session-records.js';
import { consumeResponse, recordRequest } from '../domain/session-requests.js';
import { deliverTurn, recordTurnOutcome, submitTurn } from '../domain/session-turns.js';
import type { IdempotencyRecord, SessionTimelineStore, SessionTimelineTransaction } from './session-timeline-store.js';

// The shared suite for SessionTimelineStore; each case gets an empty store.

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`conformance fixture: ${result.error.message}`);
  return result.value;
}

const id = <Kind extends string>(kind: Kind, text: string) => must(parseIdentifier(kind, text));
const TASK = id('TaskId', 'task-1') as TaskId;
const OTHER_TASK = id('TaskId', 'task-2') as TaskId;
const GENERATION = FIRST_SESSION_GENERATION;
// Strings the domain accepts that JSON and SQL text treat specially.
const AWKWARD = 'quote " backslash \\ NUL \u0000 lone \ud800 pair \u{1F600} line\nend';

function session(name: string, task: TaskId = TASK): Session {
  return openSession({ id: id('SessionId', name), taskId: task, harness: id('HarnessPluginId', 'harness-a') });
}

function bound(name: string, attempt: string, task: TaskId = TASK): Session {
  const binding = { attemptId: id('AttemptId', attempt), taskId: task, ownershipGeneration: FIRST_OWNERSHIP_GENERATION };
  return must(bindAttempt(session(name, task), binding, []));
}

// A session that holds every kind of record the domain keeps, with text
// that only an exact round trip preserves.
function fullSession(): Session {
  const running = must(startGeneration(bound('session-full', 'attempt-full'), { generation: GENERATION, nativeSessionId: id('NativeSessionId', 'native-1') }));
  const author = { kind: 'principal' as const, principalId: id('PrincipalId', 'person-1') };
  const turn = id('TurnId', 'turn-1');
  const submitted = must(submitTurn(running, { turnId: turn, key: id('IdempotencyKey', 'key-1'), author, text: AWKWARD })).session;
  const delivered = must(deliverTurn(submitted, { turnId: turn, generation: GENERATION }));
  const key = { generation: GENERATION, nativeRequestId: id('NativeRequestId', 'request-1') };
  const asked = must(recordRequest(delivered, { key, kind: 'permission-request', turnId: turn, text: AWKWARD }));
  const answered = must(consumeResponse(asked, {
    request: key, answer: { kind: 'permission', decision: 'allow', message: AWKWARD }, responder: author,
    attemptId: id('AttemptId', 'attempt-full'), ownershipGeneration: FIRST_OWNERSHIP_GENERATION,
  }));
  const output = must(appendOutput(answered, { turnId: turn, generation: GENERATION, text: AWKWARD }));
  const ended = must(recordTurnOutcome(output, { turnId: turn, generation: GENERATION, outcome: 'account-limit-reached' }));
  const stopped = must(endGeneration(recordLimitSignal(ended, { resetsAt: must(parseInstant('2026-10-29T10:00:00.000Z')) }), GENERATION));
  const evidence = must(parseEvidenceReference('evidence/handoff-1'));
  return must(writeHandoff(stopped, evidence));
}

function keyRecord(scope: string, key: string, digest = 'digest-1', outcome = 'outcome-1'): IdempotencyRecord {
  return Object.freeze({ scope, key: id('IdempotencyKey', key) as IdempotencyKey, digest, outcome });
}

const run = <T>(store: SessionTimelineStore, work: (tx: SessionTimelineTransaction) => Promise<Result<T>>) => store.transaction(work);
const get = (store: SessionTimelineStore, sessionId: SessionId) => run(store, (tx) => tx.sessions.get(sessionId));

export const SESSION_TIMELINE_STORE_CONFORMANCE: readonly ConformanceCase<SessionTimelineStore>[] = Object.freeze([
  {
    name: 'a session holding every kind of record reads back exactly, at version 1',
    async check(store) {
      const problems: string[] = [];
      const full = fullSession();
      expectSuccess(problems, 'add', await run(store, (tx) => tx.sessions.add(full)));
      expectRead(problems, 'get', await get(store, full.id), { session: full, version: 1 });
      expectRead(problems, 'unknown', await get(store, id('SessionId', 'nope')), undefined);
      return problems;
    },
  },
  {
    name: 'a session ID is added once',
    async check(store) {
      const problems: string[] = [];
      expectSuccess(problems, 'add', await run(store, (tx) => tx.sessions.add(session('session-1'))));
      expectCode(problems, 'again', await run(store, (tx) => tx.sessions.add(session('session-1', OTHER_TASK))), 'conflict');
      expectRead(problems, 'first stays', await get(store, session('session-1').id), { session: session('session-1'), version: 1 });
      return problems;
    },
  },
  {
    name: 'a replacement at the stored version advances it, and a stale one is a conflict that changes nothing',
    async check(store) {
      const problems: string[] = [];
      const first = session('session-1');
      must(await run(store, (tx) => tx.sessions.add(first)));
      const stored = must(await get(store, first.id))!;
      const next = bound('session-1', 'attempt-1');
      expectSuccess(problems, 'replace', await run(store, (tx) => tx.sessions.replace(stored, next)));
      expectRead(problems, 'replaced', await get(store, first.id), { session: next, version: 2 });
      const stale = await run(store, (tx) => tx.sessions.replace(stored, recordLimitSignal(first, {})));
      expectCode(problems, 'stale', stale, 'conflict');
      expectRead(problems, 'unchanged', await get(store, first.id), { session: next, version: 2 });
      return problems;
    },
  },
  {
    name: 'concurrent replacements at one version commit exactly one',
    async check(store) {
      const problems: string[] = [];
      must(await run(store, (tx) => tx.sessions.add(session('session-1'))));
      const stored = must(await get(store, session('session-1').id))!;
      const results = await Promise.all(['attempt-1', 'attempt-2'].map((attempt) => (
        run(store, (tx) => tx.sessions.replace(stored, bound('session-1', attempt)))
      )));
      expectOneWinner(problems, 'replace', results);
      expectSame(problems, 'version', must(await get(store, stored.session.id))?.version, 2);
      return problems;
    },
  },
  {
    name: 'a task lists its own sessions in session ID order',
    async check(store) {
      const problems: string[] = [];
      for (const added of [session('session-b'), session('session-other', OTHER_TASK), session('session-a')]) {
        must(await run(store, (tx) => tx.sessions.add(added)));
      }
      expectRead(problems, 'task', await run(store, (tx) => tx.sessions.listByTask(TASK)), [session('session-a'), session('session-b')]);
      expectRead(problems, 'none', await run(store, (tx) => tx.sessions.listByTask(id('TaskId', 'task-3') as TaskId)), []);
      return problems;
    },
  },
  {
    name: 'an attempt is bound by at most one session, on add and on replace',
    async check(store) {
      const problems: string[] = [];
      must(await run(store, (tx) => tx.sessions.add(bound('session-1', 'attempt-1'))));
      expectCode(problems, 'add', await run(store, (tx) => tx.sessions.add(bound('session-2', 'attempt-1'))), 'conflict');
      must(await run(store, (tx) => tx.sessions.add(session('session-3'))));
      const stored = must(await get(store, session('session-3').id))!;
      expectCode(problems, 'replace', await run(store, (tx) => tx.sessions.replace(stored, bound('session-3', 'attempt-1'))), 'conflict');
      expectRead(problems, 'unchanged', await get(store, stored.session.id), stored);
      return problems;
    },
  },
  {
    name: 'an idempotency key is recorded once per session and scope',
    async check(store) {
      const problems: string[] = [];
      for (const name of ['session-1', 'session-2']) must(await run(store, (tx) => tx.sessions.add(session(name))));
      const [one, two] = [session('session-1').id, session('session-2').id];
      const first = keyRecord('turn', 'key-1', 'digest \u00df \u{1F600}', 'response:1:request \u00e9');
      expectSuccess(problems, 'record', await run(store, (tx) => tx.idempotency.record(one, first)));
      expectCode(problems, 'again', await run(store, (tx) => tx.idempotency.record(one, keyRecord('turn', 'key-1', 'other'))), 'conflict');
      expectSuccess(problems, 'other scope', await run(store, (tx) => tx.idempotency.record(one, keyRecord('response:1:r', 'key-1'))));
      expectSuccess(problems, 'other session', await run(store, (tx) => tx.idempotency.record(two, keyRecord('turn', 'key-1'))));
      expectRead(problems, 'find', await run(store, (tx) => tx.idempotency.find(one, 'turn', first.key)), first);
      expectRead(problems, 'unknown', await run(store, (tx) => tx.idempotency.find(one, 'turn', id('IdempotencyKey', 'key-2'))), undefined);
      return problems;
    },
  },
  {
    name: 'a held key recorded without an outcome reads back without one',
    async check(store) {
      const problems: string[] = [];
      must(await run(store, (tx) => tx.sessions.add(session('session-1'))));
      const { outcome: _outcome, ...held } = keyRecord('response:1:request-1', 'key-1');
      expectSuccess(problems, 'record', await run(store, (tx) => tx.idempotency.record(session('session-1').id, held)));
      expectRead(problems, 'find', await run(store, (tx) => tx.idempotency.find(session('session-1').id, held.scope, held.key)), held);
      return problems;
    },
  },
  {
    name: 'a transaction whose work fails stores none of its writes',
    async check(store) {
      const problems: string[] = [];
      const failed = await run(store, async (tx) => {
        must(await tx.sessions.add(session('session-1')));
        must(await tx.idempotency.record(session('session-1').id, keyRecord('turn', 'key-1')));
        return { ok: false as const, error: { code: 'conflict' as const, message: 'rolled back', details: {} } };
      });
      expectCode(problems, 'work', failed, 'conflict');
      expectRead(problems, 'session', await get(store, session('session-1').id), undefined);
      return problems;
    },
  },
  {
    name: 'an output window trimmed by an append reads back as the domain holds it',
    async check(store) {
      const problems: string[] = [];
      const turn = id('TurnId', 'turn-1');
      const running = must(startGeneration(bound('session-1', 'attempt-1'), { generation: GENERATION, nativeSessionId: id('NativeSessionId', 'native-1') }));
      const author = { kind: 'principal' as const, principalId: id('PrincipalId', 'person-1') };
      const submitted = must(submitTurn(running, { turnId: turn, key: id('IdempotencyKey', 'key-1'), author, text: 'go' })).session;
      const append = (from: Session, count: number) => Array.from({ length: count }).reduce<Session>(
        (current) => must(appendOutput(current, { turnId: turn, generation: GENERATION, text: '€'.repeat(MAX_HARNESS_TEXT_LENGTH) })),
        from,
      );
      const early = append(must(deliverTurn(submitted, { turnId: turn, generation: GENERATION })), 3);
      must(await run(store, (tx) => tx.sessions.add(early)));
      // Each entry holds 196,608 bytes, so 54 of them pass the 10 MiB window.
      const trimmed = append(early, 51);
      expectSame(problems, 'fixture trims', trimmed.output.entries[0]?.position, 2);
      const stored = must(await get(store, early.id))!;
      expectSuccess(problems, 'replace', await run(store, (tx) => tx.sessions.replace(stored, trimmed)));
      expectRead(problems, 'window', await get(store, early.id), { session: trimmed, version: 2 });
      return problems;
    },
  },
]);

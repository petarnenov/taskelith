import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, beforeEach, test } from 'node:test';
import pg from 'pg';
import {
  ObservationService,
  PlacementService,
  RunService,
  TaskService,
  WorkflowRegistry,
  type ControlPlaneStore,
  type ControlPlaneTransaction,
} from '@taskelith/control-plane';
import type { AttemptId, SessionRecords, SessionTimelineStore, SessionView } from '@taskelith/execution';
import { fleetToken, fleetWorker } from '@taskelith/fleet';
import { err, failure, type CorrelationId, type Result } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { PostgresDatabase, PostgresSessionTimelineStore, migrate, type PostgresTransaction } from '@taskelith/postgres';
import { parseWorkflowDefinition, type TaskId } from '@taskelith/sdlc';
import { ScenarioProcess, crashEnvironment, failed, id, integrationEndpoint, uncoveredEnvironment, value } from '@taskelith/testing';
import { EVERY_PROJECT_EXISTS } from './project-fixtures.ts';
import { failingAt, sessionObservationMessage, timelineOver, timelineService } from './session-timeline-fixtures.ts';

const POSTGRES = integrationEndpoint('TASKELITH_POSTGRES_URL');
const databaseName = `taskelith_session_observation_${process.pid}`;
const url = new URL(POSTGRES);
url.pathname = `/${databaseName}`;
const admin = new pg.Client({ connectionString: POSTGRES.href });
await admin.connect();
await admin.query(`CREATE DATABASE ${databaseName}`);
value(await migrate(url));
const database = new PostgresDatabase(url);

after(async () => {
  await database.close();
  await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await admin.end();
});

async function sql<Row extends pg.QueryResultRow>(text: string, values: unknown[] = []): Promise<Row[]> {
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  try {
    return (await client.query<Row>(text, values)).rows;
  } finally {
    await client.end();
  }
}

const STEP = join(import.meta.dirname, 'fixtures', 'session-observation-step.ts');
const DIGEST = `sha256:${'ab'.repeat(32)}`;
const definition = value(parseWorkflowDefinition({
  id: 'wf', version: '1', stages: [
    { id: 'specs', obligations: ['intake', 'specification'], origin: 'native', dependsOn: [] },
    { id: 'apply', obligations: ['implementation', 'review', 'verification', 'closure'], origin: 'native', dependsOn: ['specs'] },
  ],
}));
const binding = {
  pluginId: 'p', pluginVersion: '1', upstreamToolVersion: '1', workflowId: 'wf', workflowVersion: '1', workflowDigest: DIGEST,
  configurationRevision: 'c', policyRevision: 'r',
};
const TABLES = [
  'workflow_runs', 'gates', 'admissions', 'tasks', 'assignments', 'outbox', 'inbox', 'task_lineage', 'capacity_charges', 'delegations',
  'capacity_quotas', 'workers', 'installation', 'enrollment_tokens', 'delegation_requests', 'current_revisions', 'producer_cursors',
  'placement_rotation', 'placement_outcomes', 'worker_self_check_results', 'agent_sessions', 'agent_session_output',
  'agent_session_output_tails', 'agent_session_attempts', 'session_idempotency_keys', 'session_inbox_items', 'session_audit_events',
  'ui_events',
];
const WORKER = 'worker-a';
const OTHER_WORKER = 'worker-b';
const JOURNAL = 'journal-a';
const SESSION = id('SessionId', 'session-1');
const PERSON = { kind: 'principal' as const, principalId: id('PrincipalId', 'person-1') };
const EPOCH = { recoveryEpoch: 1 };
const EVIDENCE = 'execution.observation.evidence';
const registry = new WorkflowRegistry([{ definition, digest: DIGEST }]);
const timelines = new PostgresSessionTimelineStore(database);
const timeline = timelineService(timelines);
let logs: InMemoryLogSink;
let service: ObservationService;
let confirmationIds = 0;

function observationService(store: ControlPlaneStore): ObservationService {
  return new ObservationService(store, {
    timelineOver, newConfirmationId: () => `confirmation-${++confirmationIds}`, newRequestId: () => `request-${++confirmationIds}`,
    logger: new Logger(logs, { now: () => '2026-10-25T09:00:00.000Z' as never }),
  });
}

beforeEach(async () => {
  logs = new InMemoryLogSink();
  service = observationService(database);
  await sql(`TRUNCATE ${TABLES.join(', ')}`);
  await sql('INSERT INTO installation (quarantined, recovery_epoch) VALUES (false, 1)');
  value(await new RunService(database, registry, EVERY_PROJECT_EXISTS).createRun({ runId: 'run-1', projectId: 'project-1', binding }));
});

async function enroll(workerId: string, journalId: string): Promise<void> {
  const worker = fleetWorker(workerId, journalId, { capacity: { slots: 2, cpuMillicores: 4000, memoryMebibytes: 8192, controls: [] } });
  value(await database.transaction(async (tx) => {
    const added = await tx.fleet.addToken(fleetToken(`token-${workerId}`));
    return added.ok ? tx.fleet.enroll(`token-${workerId}` as never, worker) : added;
  }));
  await sql("UPDATE workers SET worker_admission = 'admitted' WHERE worker_id = $1", [workerId]);
}

interface Placed {
  readonly taskId: TaskId;
  readonly attemptId: AttemptId;
  readonly ownershipGeneration: number;
}

// WORKER declares its capacity at sequence 1, and placement gives it the
// task's first attempt.
async function placed(): Promise<Placed> {
  await enroll(WORKER, JOURNAL);
  const declaration = {
    observationId: 'declaration-1', observationType: 'worker.capacity.declared', schemaVersion: 1, protocolVersion: 1,
    occurredAt: '2026-10-25T09:00:00.000Z', correlationId: 'correlation-d', workerId: WORKER, journalId: JOURNAL, sequence: 1,
  };
  const capacity = { slots: 2, cpuMillicores: 4000, memoryMebibytes: 8192, enforceableControls: [] };
  value(await service.apply({
    subjectWorkerId: WORKER, type: declaration.observationType,
    body: { metadata: declaration, payload: { capacity, protocolVersions: { minimum: 1, maximum: 1 } } },
  }));
  value(await new TaskService(database).submitTask('run-1', { taskId: 'task-1', kind: 'planning', stageId: 'specs' }, 'correlation-1' as CorrelationId));
  assert.equal(value(await new PlacementService(database, { now: Date.now, draw: () => 0 }).placeWaiting()).placed, 1);
  const task = value(await database.transaction((tx) => tx.tasks.get('task-1' as TaskId)));
  return { taskId: task.id, attemptId: task.attempts.at(-1)!.id, ownershipGeneration: task.ownershipGeneration };
}

// SESSION of the placed task, bound to its attempt, without a generation.
async function boundSession(): Promise<Placed> {
  const at = await placed();
  value(await timeline.openSession({ id: SESSION, taskId: at.taskId, harness: id('HarnessPluginId', 'harness-a') }));
  value(await timeline.bindAttempt(SESSION, { attemptId: at.attemptId, taskId: at.taskId, ownershipGeneration: at.ownershipGeneration as never }));
  return at;
}

function message(at: Placed, sequence: number, type: string, payload: Record<string, unknown>, workerId = WORKER, journalId = JOURNAL) {
  return sessionObservationMessage(type, payload, { workerId, journalId, sequence, attemptId: at.attemptId, ownershipGeneration: at.ownershipGeneration });
}

const started = (generation = 1) => ({ sessionId: SESSION, generation, nativeSessionId: 'native-1', ...EPOCH });
const turn = (turnId: string, generation = 1) => ({ sessionId: SESSION, turnId, generation, ...EPOCH });

async function submitted(name: string, through = timeline): Promise<string> {
  return value(await through.submitTurn(SESSION, { key: id('IdempotencyKey', name), author: PERSON, text: `please do ${name}` })).turn.id;
}

const session = async (): Promise<SessionView> => value(await timeline.readSession(SESSION));
const stateOf = (view: SessionView, turnId: string) => view.turns.find((candidate) => candidate.id === turnId)?.state;
const evidence = () => logs.records.filter((record) => record.event === EVIDENCE).map((record) => record.fields);

// What one observation commits together: the session row's version, the
// inbox rows, the cursor, and the confirmations.
async function committed() {
  const [stored] = await sql<{ version: number }>('SELECT version::int FROM agent_sessions WHERE session_id = $1', [SESSION]);
  const inbox = await sql('SELECT 1 FROM inbox');
  const [cursor] = await sql<{ confirmed_through: number }>('SELECT confirmed_through::int FROM producer_cursors WHERE worker_id = $1', [WORKER]);
  const confirmations = await sql("SELECT 1 FROM outbox WHERE event_type = 'execution.observations.confirmed'");
  return { version: stored?.version, inbox: inbox.length, confirmedThrough: cursor?.confirmed_through, confirmations: confirmations.length };
}

test('a session observation of the producer that holds the attempt changes the timeline, its inbox row, and its cursor in one commit', async () => {
  const at = await boundSession();
  const before = await committed();

  assert.equal(value(await service.apply(message(at, 2, 'session.generation.started', started()))), 'applied');

  assert.deepEqual((await session()).generations, [{ generation: 1, attemptId: at.attemptId, ended: false }]);
  assert.deepEqual(await committed(), {
    version: before.version! + 1, inbox: before.inbox + 1, confirmedThrough: 2, confirmations: before.confirmations + 1,
  });
  assert.deepEqual(evidence(), []);
});

test('a persistent invalid turn is refused over the wire path and the next turn is deliverable in the same generation', async () => {
  const at = await boundSession();
  value(await service.apply(message(at, 2, 'session.generation.started', started())));
  const first = await submitted('turn-1');
  const second = await submitted('turn-2');

  assert.equal(value(await service.apply(message(at, 3, 'session.turn.not-delivered', { ...turn(first), reason: 'turn-invalid' }))), 'applied');

  assert.equal(stateOf(await session(), first), 'refused');
  assert.equal(value(await timeline.nextDeliverableTurn(SESSION))?.id, second);
  assert.equal(value(await service.apply(message(at, 4, 'session.turn.delivered', turn(second)))), 'applied');
  assert.equal(stateOf(await session(), second), 'delivered');
  assert.equal((await committed()).confirmedThrough, 4);
});

test('a turn of unknown acceptance holds the queue over the wire path until the next generation', async () => {
  const at = await boundSession();
  value(await service.apply(message(at, 2, 'session.generation.started', started())));
  const first = await submitted('turn-1');
  const second = await submitted('turn-2');

  assert.equal(value(await service.apply(message(at, 3, 'session.turn.acceptance-unknown', { ...turn(first), reason: 'timeout' }))), 'applied');
  assert.equal(value(await timeline.nextDeliverableTurn(SESSION)), undefined);
  const output = { ...turn(first), chunk: 1, text: 'forty lines of the build' };
  assert.equal(value(await service.apply(message(at, 4, 'session.output.appended', output))), 'applied');
  value(await service.apply(message(at, 5, 'session.generation.ended', { sessionId: SESSION, generation: 1, cause: 'session-ended', ...EPOCH })));
  value(await service.apply(message(at, 6, 'session.generation.started', started(2))));

  assert.equal(value(await timeline.nextDeliverableTurn(SESSION))?.id, second);
  assert.deepEqual([stateOf(await session(), first), (await session()).outputWindow.lastPosition], ['outcome-unknown', 0]);
  assert.deepEqual(evidence(), [{ observationType: 'session.output.appended', sessionId: SESSION, reason: 'timeline-refused', code: 'precondition-failed' }]);
  assert.equal((await committed()).confirmedThrough, 6, 'the refused output held no sequence');
});

test('a worker that does not hold the attempt cannot write the session, and its observation is confirmed as evidence', async () => {
  const at = await boundSession();
  await enroll(OTHER_WORKER, 'journal-b');
  const before = await session();

  assert.equal(value(await service.apply(message(at, 1, 'session.generation.started', started(), OTHER_WORKER, 'journal-b'))), 'applied');

  assert.deepEqual(await session(), before);
  assert.deepEqual(evidence(), [{ observationType: 'session.generation.started', sessionId: SESSION, reason: 'attempt-not-held' }]);
  const [cursor] = await sql<{ confirmed_through: number }>('SELECT confirmed_through::int FROM producer_cursors WHERE worker_id = $1', [OTHER_WORKER]);
  assert.equal(cursor?.confirmed_through, 1);
});

test('an observation of an unknown session or of another attempt is confirmed as evidence without effect', async () => {
  const at = await boundSession();
  const before = await session();

  const unknown = message(at, 2, 'session.generation.started', { ...started(), sessionId: 'session-unknown' });
  assert.equal(value(await service.apply(unknown)), 'applied');
  const other = message({ ...at, attemptId: 'attempt-other' as AttemptId }, 3, 'session.generation.started', started());
  assert.equal(value(await service.apply(other)), 'applied');

  assert.deepEqual(await session(), before);
  assert.deepEqual(evidence().map((fields) => [fields.sessionId, fields.reason]), [['session-unknown', 'session-unknown'], [SESSION, 'attempt-not-current']]);
  assert.equal((await committed()).confirmedThrough, 3);
});

for (const [gate, installation, recoveryEpoch] of [
  ['an older epoch', 'quarantined = false, recovery_epoch = 2', 1],
  ['a newer epoch', 'quarantined = false, recovery_epoch = 2', 3],
  ['restore quarantine', 'quarantined = true', 1],
] as const) {
  test(`a session observation of ${gate} is kept as evidence and changes no timeline`, async () => {
    const at = await boundSession();
    await sql(`UPDATE installation SET ${installation}`);
    const before = await session();

    assert.equal(value(await service.apply(message(at, 2, 'session.generation.started', { ...started(), recoveryEpoch }))), 'applied');

    assert.deepEqual(await session(), before);
    assert.deepEqual(evidence().map((fields) => [fields.observationType, fields.recoveryEpoch, fields.reason]), [
      ['session.generation.started', recoveryEpoch, undefined],
    ]);
    assert.equal((await committed()).confirmedThrough, 2);
  });
}

// The transaction's cursors fail as a store that went down would.
function withFailingCursorSave(tx: PostgresTransaction): ControlPlaneTransaction {
  const down = async (): Promise<Result<void>> => err(failure('unavailable', 'the store is down'));
  const cursors = new Proxy(tx.cursors, {
    get: (records, member) => (member === 'save' ? down : (Reflect.get(records, member) as (...values: unknown[]) => unknown).bind(records)),
  });
  return { ...tx, now: () => tx.now(), cursors };
}

test('a store failure after the timeline changed commits nothing, and the redelivery applies the observation once', async () => {
  const at = await boundSession();
  const before = await committed();
  const failing: ControlPlaneStore = {
    transaction: (work) => database.transaction((tx) => work(withFailingCursorSave(tx))),
    readCommitted: (work) => database.readCommitted((tx) => work(tx)),
  };
  const start = message(at, 2, 'session.generation.started', started());

  assert.equal(failed(await observationService(failing).apply(start)).code, 'unavailable');

  assert.deepEqual([await committed(), (await session()).generations], [before, []]);
  assert.equal(value(await service.apply(start)), 'applied');
  assert.equal((await session()).generations.length, 1);
});

// What a recorded request writes beside its session: its idempotency key,
// its inbox item, and the events of both.
async function requestRows() {
  const count = async (table: string) => (await sql(`SELECT 1 FROM ${table}`)).length;
  return { keys: await count('session_idempotency_keys'), items: await count('session_inbox_items'), events: await count('ui_events') };
}

test('a store conflict after the timeline wrote a request commits nothing, and the redelivery records the request once', async () => {
  const at = await boundSession();
  value(await service.apply(message(at, 2, 'session.generation.started', started())));
  const first = await submitted('turn-1');
  value(await service.apply(message(at, 3, 'session.turn.delivered', turn(first))));
  const before = { ...await committed(), ...await requestRows() };
  const refuseItem = failingAt('items', 'add', 'conflict');
  const failing: ControlPlaneStore = {
    transaction: (work) => database.transaction((tx) => work({ ...tx, now: () => tx.now(), sessionTimeline: refuseItem(tx.sessionTimeline) })),
    readCommitted: (work) => database.readCommitted((tx) => work(tx)),
  };
  const request = { generation: 1, nativeRequestId: 'request-1' };
  const recorded = message(at, 4, 'session.request.recorded', {
    sessionId: SESSION, request, kind: 'permission-request', turnId: first, text: 'may the agent run the linter', ...EPOCH,
  });

  assert.equal(failed(await observationService(failing).apply(recorded)).code, 'internal');

  assert.deepEqual([{ ...await committed(), ...await requestRows() }, (await session()).requests, evidence()], [before, [], []]);
  assert.equal(value(await service.apply(recorded)), 'applied');
  assert.deepEqual((await session()).requests.map((held) => [held.key, held.state]), [[request, 'open']]);
  const after = { ...await committed(), ...await requestRows() };
  assert.deepEqual([after.version, after.inbox, after.confirmedThrough, after.keys - before.keys, after.items], [before.version! + 1, before.inbox + 1, 4, 1, 1]);
  assert.ok(after.events > before.events, 'the request and its item are published once it commits');
});

interface StepRun {
  readonly signal: string | null;
  readonly stdout: string;
}

// The step runs in a process of its own, so a rerun is a restart.
async function runStep(observation: object, crashPoint?: string): Promise<StepRun> {
  const crash = crashPoint === undefined ? {} : crashEnvironment(crashPoint);
  const child = await ScenarioProcess.start(process.execPath, ['--experimental-strip-types', STEP, url.href, JSON.stringify(observation)], {
    env: { ...uncoveredEnvironment(), ...crash },
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 60_000);
  const exit = await child.exited.finally(() => clearTimeout(timer));
  assert.equal(timedOut, false, 'the step did not end within 60 s');
  assert.equal(child.stderr, '', `the step wrote to stderr (exit ${exit.code})`);
  return { signal: exit.signal, stdout: child.stdout };
}

const KILLED: StepRun = { signal: 'SIGKILL', stdout: '' };

for (const point of ['SessionTimelineCommit', 'InboxCommit', 'OutboxCommit']) {
  test(`an observation killed before ${point} stores no timeline change, inbox row, or cursor, and the redelivery applies it`, async () => {
    const at = await boundSession();
    const before = await committed();
    const start = message(at, 2, 'session.generation.started', started());

    assert.deepEqual(await runStep(start, `${point}.before`), KILLED);

    assert.deepEqual([await committed(), (await session()).generations], [before, []]);
    assert.deepEqual(JSON.parse((await runStep(start)).stdout), { ok: true, value: 'applied' });
    assert.deepEqual(await committed(), { version: before.version! + 1, inbox: before.inbox + 1, confirmedThrough: 2, confirmations: before.confirmations + 1 });
  });

  test(`an observation killed after ${point} keeps its timeline change, inbox row, and cursor, and the redelivery is a duplicate`, async () => {
    const at = await boundSession();
    const before = await committed();
    const start = message(at, 2, 'session.generation.started', started());

    assert.deepEqual(await runStep(start, `${point}.after`), KILLED);

    const stored = { version: before.version! + 1, inbox: before.inbox + 1, confirmedThrough: 2, confirmations: before.confirmations + 1 };
    assert.deepEqual([await committed(), (await session()).generations.length], [stored, 1]);
    assert.deepEqual(JSON.parse((await runStep(start)).stdout), { ok: true, value: 'duplicate' });
    assert.deepEqual([(await committed()).version, (await session()).generations.length], [stored.version, 1]);
  });
}

// Without a lost race: the observation, its contact, and the submission.
const RACED_ATTEMPTS = 3;
// The transaction attempts of both racing parties, the contact's included.
let attempts = 0;

// Each party's first session read waits until every party has read, so
// both transactions hold the same snapshot of the row before either writes.
function barrier(parties: number): () => () => Promise<void> {
  attempts = 0;
  let arrived = 0;
  let release!: () => void;
  const open = new Promise<void>((resolve) => {
    release = resolve;
  });
  return () => {
    let counted = false;
    return async () => {
      if (!counted && ++arrived >= parties) release();
      counted = true;
      await open;
    };
  };
}

function heldSessions(records: SessionRecords, wait: () => Promise<void>): SessionRecords {
  return {
    get: async (sessionId) => {
      const stored = await records.get(sessionId);
      await wait();
      return stored;
    },
    add: (added) => records.add(added),
    replace: (stored, next) => records.replace(stored, next),
    listByTask: (taskId) => records.listByTask(taskId),
  };
}

// The observation's store, whose session reads wait at the barrier.
function observingStore(wait: () => Promise<void>): ControlPlaneStore {
  const held = (tx: PostgresTransaction): ControlPlaneTransaction => {
    const { idempotency, items, audit, scopes, tails, events } = tx.sessionTimeline;
    const sessionTimeline = { sessions: heldSessions(tx.sessionTimeline.sessions, wait), idempotency, items, audit, scopes, tails, events };
    attempts += 1;
    return { ...tx, now: () => tx.now(), sessionTimeline };
  };
  return {
    transaction: (work) => database.transaction((tx) => work(held(tx))),
    readCommitted: (work) => database.readCommitted((tx) => work(tx)),
  };
}

// A person's submission over the timeline store, held at the same barrier.
function submittingStore(wait: () => Promise<void>): SessionTimelineStore {
  return {
    transaction: (work) => timelines.transaction(({ sessions, idempotency, items, audit, scopes, tails, events }) => {
      attempts += 1;
      return work({ sessions: heldSessions(sessions, wait), idempotency, items, audit, scopes, tails, events });
    }),
  };
}

test('a turn submitted while an observation changes the same session row loses no write: both commit', async () => {
  const at = await boundSession();
  value(await service.apply(message(at, 2, 'session.generation.started', started())));
  const party = barrier(2);
  const end = message(at, 3, 'session.generation.ended', { sessionId: SESSION, generation: 1, cause: 'session-ended', ...EPOCH });

  const [observed, turnId] = await Promise.all([
    observationService(observingStore(party())).apply(end),
    submitted('turn-raced', timelineService(submittingStore(party()))),
  ]);

  assert.equal(value(observed), 'applied');
  const view = await session();
  assert.deepEqual([view.generations[0]?.ended, stateOf(view, turnId)], [true, 'queued']);
  assert.equal(attempts >= RACED_ATTEMPTS + 1, true, `one transaction lost the race and ran again (${attempts} attempts)`);
  assert.deepEqual(evidence(), [], 'the lost race was run again, not kept as a refusal');
  assert.deepEqual([(await committed()).confirmedThrough, (await committed()).inbox], [3, 3]);
});

test('turn 2 submitted while turn 1 is refused as invalid is recorded, and it is the next deliverable turn', async () => {
  const at = await boundSession();
  value(await service.apply(message(at, 2, 'session.generation.started', started())));
  const first = await submitted('turn-1');
  const party = barrier(2);
  const refusal = message(at, 3, 'session.turn.not-delivered', { ...turn(first), reason: 'turn-invalid' });

  const [observed, second] = await Promise.all([
    observationService(observingStore(party())).apply(refusal),
    submitted('turn-2', timelineService(submittingStore(party()))),
  ]);

  assert.equal(value(observed), 'applied');
  const view = await session();
  assert.deepEqual([stateOf(view, first), stateOf(view, second)], ['refused', 'queued']);
  assert.equal(value(await timeline.nextDeliverableTurn(SESSION))?.id, second);
  assert.equal(attempts >= RACED_ATTEMPTS + 1, true, `one transaction lost the race and ran again (${attempts} attempts)`);
  assert.deepEqual(evidence(), []);
});

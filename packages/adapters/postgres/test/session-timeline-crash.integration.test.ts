import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, beforeEach, test } from 'node:test';
import { PostgresDatabase } from '@taskelith/postgres';
import { ScenarioProcess, crashEnvironment, failed, uncoveredEnvironment, value } from '@taskelith/testing';
import {
  NATIVE,
  SESSION,
  allow,
  generation,
  key,
  permissionRequest,
  postgresService,
  runningSession,
  sessionWithOpenRequest,
  turn,
} from './session-timeline-fixtures.ts';
import { createMigratedDatabase, query, truncateAll } from './test-database.ts';

const STEP = join(import.meta.dirname, 'fixtures', 'session-timeline-step.ts');
const url = await createMigratedDatabase();
const database = new PostgresDatabase(url);
const service = postgresService(database);
after(() => database.close());
beforeEach(() => truncateAll(url));

interface StepRun {
  readonly signal: string | null;
  readonly stdout: string;
}

// Each step runs in a process of its own, so a rerun is a restart: a new
// process with a new pool over the same database (coordinator answer Q6).
async function runStep(step: string, crashPoint?: string): Promise<StepRun> {
  const crash = crashPoint === undefined ? {} : crashEnvironment(crashPoint);
  const child = await ScenarioProcess.start(process.execPath, ['--experimental-strip-types', STEP, url.href, step], {
    env: { ...uncoveredEnvironment(), ...crash },
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 60_000);
  const exit = await child.exited.finally(() => clearTimeout(timer));
  assert.equal(timedOut, false, `the step ${step} did not end within 60 s`);
  assert.equal(child.stderr, '', `the step ${step} wrote to stderr (exit ${exit.code})`);
  return { signal: exit.signal, stdout: child.stdout };
}

const KILLED: StepRun = { signal: 'SIGKILL', stdout: '' };

function stepResult(run: StepRun): { ok: boolean; value?: Record<string, unknown>; error?: { code: string } } {
  assert.equal(run.signal, null);
  return JSON.parse(run.stdout) as { ok: boolean };
}

async function version(): Promise<number> {
  const [row] = await query<{ version: number }>(url, 'SELECT version::int FROM agent_sessions WHERE session_id = $1', [SESSION]);
  return row!.version;
}

async function counts(): Promise<{ turns: number; keys: number }> {
  const view = value(await service.readSession(SESSION));
  const [row] = await query<{ keys: number }>(url, "SELECT count(*)::int AS keys FROM session_idempotency_keys WHERE scope = 'turn'");
  return { turns: view.turns.length, keys: row!.keys };
}

async function requestStates(): Promise<string[]> {
  return value(await service.readSession(SESSION)).requests.map((request) => request.state);
}

// Each inbox item row as its request, kind, and state.
async function itemStates(): Promise<string[]> {
  const rows = await query<{ item: string }>(url, `SELECT native_request_id || ':' || kind || ':' || state AS item
    FROM session_inbox_items ORDER BY native_request_id, kind`);
  return rows.map((row) => row.item);
}

// A turn delivered in generation 1.
async function deliveredTurn(): Promise<void> {
  await runningSession(service);
  const first = value(await service.submitTurn(SESSION, turn('turn-1')));
  value(await service.deliverTurn(SESSION, { turnId: first.turn.id, generation: generation(1) }));
}

test('a submission killed before its commit stores no turn and no key, and the retry records one turn at position 1', async () => {
  await runningSession(service);
  assert.deepEqual(await runStep('submit', 'SessionTimelineCommit.before'), KILLED);
  assert.deepEqual(await counts(), { turns: 0, keys: 0 });
  const retry = stepResult(await runStep('submit'));
  assert.deepEqual([retry.value?.effect, (retry.value?.turn as { position: number }).position], ['recorded', 1]);
  assert.deepEqual(await counts(), { turns: 1, keys: 1 });
});

test('a submission killed after its commit keeps one turn and its key, and the retry is its duplicate', async () => {
  await runningSession(service);
  assert.deepEqual(await runStep('submit', 'SessionTimelineCommit.after'), KILLED);
  assert.deepEqual(await counts(), { turns: 1, keys: 1 });
  const stored = value(await service.readSession(SESSION)).turns[0]!;
  const retry = stepResult(await runStep('submit'));
  assert.deepEqual([retry.value?.effect, (retry.value?.turn as { id: string }).id], ['duplicate', stored.id]);
  assert.deepEqual(await counts(), { turns: 1, keys: 1 });
});

test('a response killed before its commit leaves the request and its item open, and the retry consumes it and resolves the item once', async () => {
  await sessionWithOpenRequest(service);
  assert.deepEqual(await runStep('respond', 'SessionTimelineCommit.before'), KILLED);
  assert.deepEqual([await requestStates(), await itemStates()], [['open'], ['request-1:permission-request:open']]);
  assert.equal(stepResult(await runStep('respond')).value?.state, 'answered');
  assert.deepEqual([await requestStates(), await itemStates()], [['answered'], ['request-1:permission-request:resolved']]);
});

test('a response killed after its commit stays answered; its key repeated returns it, and another key or answer is a conflict', async () => {
  await sessionWithOpenRequest(service);
  assert.deepEqual(await runStep('respond', 'SessionTimelineCommit.after'), KILLED);
  assert.deepEqual([await requestStates(), await itemStates()], [['answered'], ['request-1:permission-request:resolved']]);
  const committed = await version();
  assert.equal(stepResult(await runStep('respond')).value?.state, 'answered');
  assert.equal(await version(), committed);
  assert.equal(failed(await service.consumeResponse(SESSION, allow('answer-2'))).code, 'conflict');
  assert.equal(failed(await service.consumeResponse(SESSION, allow('answer-1', 'request-1', 'deny'))).details.reason, 'idempotency-key-reused');
});

test('a request killed before its commit is listed by no read and has no item, and the repeated report records both once', async () => {
  await deliveredTurn();
  assert.deepEqual(await runStep('record-request', 'SessionTimelineCommit.before'), KILLED);
  assert.deepEqual([value(await service.requestsAwaitingAnswer(SESSION)), await itemStates()], [[], []]);
  assert.equal(stepResult(await runStep('record-request')).ok, true);
  assert.equal(value(await service.requestsAwaitingAnswer(SESSION)).length, 1);
  assert.deepEqual(await itemStates(), ['request-2:permission-request:open']);
});

test('a request killed after its commit is listed once with its item, and a repeated report changes nothing', async () => {
  await deliveredTurn();
  assert.deepEqual(await runStep('record-request', 'SessionTimelineCommit.after'), KILLED);
  const listed = value(await service.requestsAwaitingAnswer(SESSION));
  assert.deepEqual(listed.map((request) => request.key.nativeRequestId), ['request-2']);
  assert.deepEqual(await itemStates(), ['request-2:permission-request:open']);
  const committed = await version();
  assert.equal(stepResult(await runStep('record-request')).ok, true);
  assert.deepEqual(value(await service.requestsAwaitingAnswer(SESSION)), listed);
  assert.deepEqual(await itemStates(), ['request-2:permission-request:open']);
  assert.equal(await version(), committed);
});

// Generation 1 runs its turn with the answered `request-1`, whose delivery
// is pending, and the open `request-2`.
async function generationToReconcile(): Promise<void> {
  const running = await sessionWithOpenRequest(service);
  value(await service.consumeResponse(SESSION, allow('answer-1')));
  value(await service.recordRequest(SESSION, { ...permissionRequest('request-2', 'turn-1'), turnId: running }));
}

const RECONCILED = { turns: ['outcome-unknown'], requests: ['answered:delivery-uncertain', 'unresolved'] };

async function reconciliation(): Promise<typeof RECONCILED> {
  const view = value(await service.readSession(SESSION));
  return {
    turns: view.turns.map((entry) => entry.state),
    requests: view.requests.map((request) => (request.state === 'answered' ? `answered:${request.response.delivery}` : request.state)),
  };
}

// The items after the reconciliation: the open request's closed, and an
// acknowledgement item opened for the uncertain delivery (wire section 8.1).
const RECONCILED_ITEMS = [
  'request-1:delivery-acknowledgement:open', 'request-1:permission-request:resolved', 'request-2:permission-request:closed',
];

test('a generation end killed before its commit reconciles nothing and opens no item, and the repeat reconciles once', async () => {
  await generationToReconcile();
  assert.deepEqual(await runStep('end-generation', 'SessionTimelineCommit.before'), KILLED);
  assert.deepEqual(await reconciliation(), { turns: ['delivered'], requests: ['answered:pending', 'open'] });
  assert.deepEqual(await itemStates(), ['request-1:permission-request:resolved', 'request-2:permission-request:open']);
  assert.equal(stepResult(await runStep('end-generation')).ok, true);
  assert.deepEqual([await reconciliation(), await itemStates()], [RECONCILED, RECONCILED_ITEMS]);
});

test('a generation end killed after its commit is reconciled with its items after the restart, and a repeat changes nothing', async () => {
  await generationToReconcile();
  assert.deepEqual(await runStep('end-generation', 'SessionTimelineCommit.after'), KILLED);
  assert.deepEqual([await reconciliation(), await itemStates()], [RECONCILED, RECONCILED_ITEMS]);
  const committed = await version();
  assert.equal(stepResult(await runStep('end-generation')).ok, true);
  assert.equal(await version(), committed);
});

// The queued turns of keys `turn-1` and `turn-2` in running generation 1.
async function twoQueuedTurns(): Promise<void> {
  await runningSession(service);
  for (const name of ['turn-1', 'turn-2']) value(await service.submitTurn(SESSION, turn(name)));
}

test('acceptance unknown killed after its commit survives the restart and holds generation 1 until generation 2 runs', async () => {
  await twoQueuedTurns();
  assert.deepEqual(await runStep('acceptance-unknown', 'SessionTimelineCommit.after'), KILLED);
  const committed = await version();
  assert.equal(stepResult(await runStep('acceptance-unknown')).ok, true);
  assert.equal(await version(), committed);
  assert.deepEqual(value(await service.readSession(SESSION)).turns.map((entry) => entry.state), ['outcome-unknown', 'queued']);
  assert.equal(value(await service.nextDeliverableTurn(SESSION)), undefined);
  value(await service.endGeneration(SESSION, generation(1)));
  value(await service.startGeneration(SESSION, { generation: generation(2), nativeSessionId: NATIVE }));
  assert.equal(value(await service.nextDeliverableTurn(SESSION))?.key, key('turn-2'));
});

test('a refusal killed after its commit survives the restart, and the next queued turn is deliverable in generation 1', async () => {
  await twoQueuedTurns();
  assert.deepEqual(await runStep('refused', 'SessionTimelineCommit.after'), KILLED);
  const committed = await version();
  assert.equal(stepResult(await runStep('refused')).ok, true);
  assert.equal(await version(), committed);
  assert.deepEqual(value(await service.readSession(SESSION)).turns.map((entry) => entry.state), ['refused', 'queued']);
  assert.equal(value(await service.nextDeliverableTurn(SESSION))?.key, key('turn-2'));
});

// `request-1`, answered, whose generation ended with its delivery pending,
// so its delivery is uncertain and its acknowledgement item open.
async function uncertainDelivery(): Promise<void> {
  await query(url, "INSERT INTO workflow_runs (id, generation, record, project_id, created_at) VALUES ('run-alpha', 1, '{}', 'alpha', now())");
  await query(url, `INSERT INTO task_lineage (task_id, parent_task_id, root_task_id, depth, project_id, run_id)
    VALUES ('task-1', NULL, 'task-1', 0, 'alpha', 'run-alpha')`);
  await sessionWithOpenRequest(service);
  value(await service.consumeResponse(SESSION, allow('answer-1')));
  value(await service.endGeneration(SESSION, generation(1)));
}

// The acknowledgement item's state with its audit events and inbox keys.
async function acknowledgement(): Promise<{ item: string | undefined; audits: number; keys: number }> {
  const item = (await itemStates()).find((state) => state.includes('delivery-acknowledgement'));
  const [row] = await query<{ audits: number; keys: number }>(url, `SELECT
    (SELECT count(*)::int FROM session_audit_events) AS audits,
    (SELECT count(*)::int FROM session_idempotency_keys WHERE scope LIKE 'item:%') AS keys`);
  return { item, audits: row!.audits, keys: row!.keys };
}

const OPEN = 'request-1:delivery-acknowledgement:open';
const RESOLVED = 'request-1:delivery-acknowledgement:resolved';

test('an acknowledgement killed before its commit leaves no resolution, audit event, or key, and the retry writes each once', async () => {
  await uncertainDelivery();
  assert.deepEqual(await runStep('acknowledge', 'SessionTimelineCommit.before'), KILLED);
  assert.deepEqual(await acknowledgement(), { item: OPEN, audits: 0, keys: 0 });
  assert.equal(stepResult(await runStep('acknowledge')).value?.state, 'resolved');
  assert.deepEqual(await acknowledgement(), { item: RESOLVED, audits: 1, keys: 1 });
});

test('an acknowledgement killed after its commit keeps its resolution, audit event, and key, and the retry adds none', async () => {
  await uncertainDelivery();
  assert.deepEqual(await runStep('acknowledge', 'SessionTimelineCommit.after'), KILLED);
  assert.deepEqual(await acknowledgement(), { item: RESOLVED, audits: 1, keys: 1 });
  assert.equal(stepResult(await runStep('acknowledge')).value?.state, 'resolved');
  assert.deepEqual(await acknowledgement(), { item: RESOLVED, audits: 1, keys: 1 });
});

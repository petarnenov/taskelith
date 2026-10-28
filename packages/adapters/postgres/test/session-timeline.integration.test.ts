import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { KEY_REUSED, SESSION_TIMELINE_STORE_CONFORMANCE, type SessionTimelineService } from '@taskelith/execution';
import { PostgresDatabase, PostgresSessionTimelineStore } from '@taskelith/postgres';
import { failed, value } from '@taskelith/testing';
import {
  ATTEMPT,
  Barrier,
  HARNESS,
  NATIVE,
  OTHER_PERSON,
  OTHER_SESSION,
  OWNERSHIP,
  SESSION,
  TASK,
  allow,
  barrierStore,
  generation,
  permissionRequest,
  postgresService,
  runningSession,
  sessionWithOpenRequest,
  timelineService,
  turn,
} from './session-timeline-fixtures.ts';
import { createMigratedDatabase, query, truncateAll } from './test-database.ts';

const url = await createMigratedDatabase();
const database = new PostgresDatabase(url);
after(() => database.close());

for (const conformance of SESSION_TIMELINE_STORE_CONFORMANCE) {
  test(`PostgreSQL session timeline: ${conformance.name}`, { concurrency: false }, async () => {
    await truncateAll(url);
    assert.deepEqual(await conformance.check(new PostgresSessionTimelineStore(database)), []);
  });
}

// Two services over one database whose first transactions both read
// before either writes, as two control-plane requests at once.
function racingServices(): [SessionTimelineService, SessionTimelineService] {
  const barrier = new Barrier(2);
  const store = () => barrierStore(new PostgresSessionTimelineStore(database), barrier);
  return [timelineService(store()), timelineService(store())];
}

const service = postgresService(database);

async function turnCount(): Promise<number> {
  return value(await service.readSession(SESSION)).turns.length;
}

test.describe('session timeline on PostgreSQL', { concurrency: false }, () => {
  beforeEach(() => truncateAll(url));

  test('two concurrent submissions of one key and input record one turn, and the other is its duplicate', async () => {
    await runningSession(service);
    const [left, right] = racingServices();
    const results = (await Promise.all([left.submitTurn(SESSION, turn('key-1')), right.submitTurn(SESSION, turn('key-1'))])).map(value);
    assert.deepEqual(results.map((result) => result.effect).sort(), ['duplicate', 'recorded']);
    assert.equal(results[0]!.turn.id, results[1]!.turn.id);
    assert.equal(await turnCount(), 1);
  });

  test('two concurrent submissions of one key with two inputs record one turn, and the other fails idempotency-key-reused', async () => {
    await runningSession(service);
    const [left, right] = racingServices();
    const results = await Promise.all([left.submitTurn(SESSION, turn('key-1', 'one')), right.submitTurn(SESSION, turn('key-1', 'two'))]);
    assert.deepEqual(results.map((result) => result.ok).sort(), [false, true]);
    const loser = failed(results.find((result) => !result.ok)!);
    assert.deepEqual([loser.code, loser.details.reason], ['conflict', KEY_REUSED]);
    assert.equal(await turnCount(), 1);
  });

  test('two concurrent submissions of two keys take positions 1 and 2', async () => {
    await runningSession(service);
    const [left, right] = racingServices();
    const results = await Promise.all([left.submitTurn(SESSION, turn('key-1')), right.submitTurn(SESSION, turn('key-2'))]);
    assert.deepEqual(results.map((result) => value(result).turn.position).sort(), [1, 2]);
    assert.deepEqual(value(await service.readSession(SESSION)).turns.map((entry) => entry.position), [1, 2]);
  });

  test('two concurrent answers under two keys consume one response, and the other fails with conflict', async () => {
    await sessionWithOpenRequest(service);
    const [left, right] = racingServices();
    const results = await Promise.all([left.consumeResponse(SESSION, allow('answer-1')), right.consumeResponse(SESSION, allow('answer-2', 'request-1', 'deny'))]);
    assert.deepEqual(results.map((result) => result.ok).sort(), [false, true]);
    const winner = value(results.find((result) => result.ok)!);
    assert.equal(failed(results.find((result) => !result.ok)!).code, 'conflict');
    const stored = value(await service.readSession(SESSION)).requests[0]!;
    assert.deepEqual(stored, winner);
  });

  test('two concurrent answers under one key and input consume one response, and both return it', async () => {
    await sessionWithOpenRequest(service);
    const [left, right] = racingServices();
    const results = (await Promise.all([left.consumeResponse(SESSION, allow('answer-1')), right.consumeResponse(SESSION, allow('answer-1'))])).map(value);
    assert.deepEqual(results[0], results[1]);
    assert.equal(results[0]!.state, 'answered');
    const [row] = await query<{ keys: number }>(url, 'SELECT count(*)::int AS keys FROM session_idempotency_keys WHERE scope LIKE $1', ['response:%']);
    assert.equal(row!.keys, 1);
  });

  test('one attempt bound at once to two sessions of its task is bound to exactly one', async () => {
    for (const id of [SESSION, OTHER_SESSION]) value(await service.openSession({ id, taskId: TASK, harness: HARNESS }));
    const [left, right] = racingServices();
    const binding = { attemptId: ATTEMPT, taskId: TASK, ownershipGeneration: OWNERSHIP };
    const results = await Promise.all([left.bindAttempt(SESSION, binding), right.bindAttempt(OTHER_SESSION, binding)]);
    assert.deepEqual(results.map((result) => result.ok).sort(), [false, true]);
    assert.equal(failed(results.find((result) => !result.ok)!).code, 'conflict');
    assert.deepEqual(await query(url, 'SELECT count(*)::int AS rows FROM agent_session_attempts'), [{ rows: 1 }]);
  });

  test('an answer racing its generation end is either answered then delivery-uncertain, or not-found on an unresolved request', async () => {
    await sessionWithOpenRequest(service);
    const [left, right] = racingServices();
    const [answered, ended] = await Promise.all([left.consumeResponse(SESSION, allow('answer-1')), right.endGeneration(SESSION, generation(1))]);
    value(ended);
    const request = value(await service.readSession(SESSION)).requests[0]!;
    if (answered.ok) {
      assert.deepEqual([request.state, request.state === 'answered' && request.response.delivery], ['answered', 'delivery-uncertain']);
    } else {
      assert.deepEqual([failed(answered).code, request.state], ['not-found', 'unresolved']);
    }
  });

  test('the same key and text from another author fails idempotency-key-reused after a new pool reads the key', async () => {
    await runningSession(service);
    value(await service.submitTurn(SESSION, turn('key-1')));
    const restarted = new PostgresDatabase(url);
    try {
      const reused = failed(await postgresService(restarted).submitTurn(SESSION, turn('key-1', 'text of key-1', OTHER_PERSON)));
      assert.deepEqual([reused.code, reused.details.reason], ['conflict', KEY_REUSED]);
      assert.equal(value(await postgresService(restarted).submitTurn(SESSION, turn('key-1'))).effect, 'duplicate');
    } finally {
      await restarted.close();
    }
    assert.equal(await turnCount(), 1);
  });

  test('a response to a reused native request ID of an earlier generation fails as that request requires', async () => {
    await sessionWithOpenRequest(service);
    value(await service.consumeResponse(SESSION, allow('answer-1')));
    value(await service.endGeneration(SESSION, generation(1)));
    value(await service.startGeneration(SESSION, { generation: generation(2), nativeSessionId: NATIVE }));
    const second = value(await service.submitTurn(SESSION, turn('turn-2')));
    value(await service.deliverTurn(SESSION, { turnId: second.turn.id, generation: generation(2) }));
    value(await service.recordRequest(SESSION, { ...permissionRequest('request-1', 'turn-2', 2), turnId: second.turn.id }));
    assert.equal(failed(await service.consumeResponse(SESSION, allow('answer-2'))).code, 'conflict');
    const open = value(await service.requestsAwaitingAnswer(SESSION));
    assert.deepEqual(open.map((request) => [request.key.generation, request.state]), [[2, 'open']]);
  });
});

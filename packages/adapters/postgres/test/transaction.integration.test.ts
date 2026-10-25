import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { err, failure, parseIdentifier } from '@taskelith/kernel';
import { CrashPoints, SimulatedCrash } from '@taskelith/testing';
import { PostgresDatabase, PostgresOutboxRelay, SERIALIZATION_ATTEMPTS, type PostgresDatabaseOptions } from '@taskelith/postgres';
import { endAssignment } from '@taskelith/scheduling';
import { AT, assignment, command, value } from './fixtures.ts';
import { createMigratedDatabase, query, truncateAll } from './test-database.ts';

const url = await createMigratedDatabase();
const opened: PostgresDatabase[] = [];
after(() => Promise.all(opened.map((database) => database.close())));
beforeEach(() => truncateAll(url));

function open(options: PostgresDatabaseOptions = {}): PostgresDatabase {
  const database = new PostgresDatabase(url, options);
  opened.push(database);
  return database;
}

async function counts(): Promise<{ assignments: number; outbox: number; inbox: number }> {
  const [row] = await query<{ assignments: number; outbox: number; inbox: number }>(url,
    'SELECT (SELECT count(*)::int FROM assignments) AS assignments, (SELECT count(*)::int FROM outbox) AS outbox, (SELECT count(*)::int FROM inbox) AS inbox');
  return row!;
}

// The capacity contract's placement: reservation, assignment, and command
// commit together or not at all.
function placement(id: string) {
  return async (tx: Parameters<Parameters<PostgresDatabase['transaction']>[0]>[0]) => {
    const added = await tx.assignments.add(assignment(id));
    if (!added.ok) return added;
    return tx.outbox.append(command(`offer-${id}`));
  };
}

test('state and outbox commit together, and an Err rolls both back', async () => {
  const database = open();
  assert.deepEqual(await database.transaction(placement('assignment-1')), { ok: true, value: undefined });
  const rejected = await database.transaction(async (tx) => {
    await placement('assignment-2')(tx);
    return err(failure('precondition-failed', 'placement no longer fits'));
  });
  assert.equal(!rejected.ok && rejected.error.code, 'precondition-failed');
  assert.deepEqual(await counts(), { assignments: 1, outbox: 1, inbox: 0 });
});

test('a crash before the outbox commit leaves nothing, and one after it leaves all', async () => {
  for (const [point, expected] of [['OutboxCommit.before', 0], ['OutboxCommit.after', 1]] as const) {
    await truncateAll(url);
    const crashPoints = new CrashPoints({ point, occurrence: 1, action: 'throw' });
    const database = open({ crashPoints });
    await assert.rejects(database.transaction(placement('assignment-1')), SimulatedCrash);
    assert.deepEqual(await counts(), { assignments: expected, outbox: expected, inbox: 0 }, point);
    assert.deepEqual(crashPoints.reached, point === 'OutboxCommit.before' ? [point] : ['OutboxCommit.before', point]);
  }
});

test('an inbox entry commits with the state it applied, and a repeat is a duplicate', async () => {
  const crashPoints = new CrashPoints({ point: 'InboxCommit.before', occurrence: 2, action: 'throw' });
  const database = open({ crashPoints });
  const messageId = value(parseIdentifier('EventId', 'observation-1'));
  const apply = (id: string) => database.transaction(async (tx) => {
    const accepted = await tx.inbox.accept('observations', messageId);
    if (!accepted.ok || accepted.value === 'duplicate') return accepted;
    const added = await tx.assignments.add(assignment(id));
    return added.ok ? accepted : added;
  });
  assert.deepEqual(await apply('assignment-1'), { ok: true, value: 'accepted' });
  assert.deepEqual(await apply('assignment-2'), { ok: true, value: 'duplicate' });
  const otherMessage = value(parseIdentifier('EventId', 'observation-2'));
  await assert.rejects(database.transaction(async (tx) => tx.inbox.accept('observations', otherMessage)), SimulatedCrash);
  assert.deepEqual(await counts(), { assignments: 1, outbox: 0, inbox: 1 });
  assert.deepEqual(crashPoints.reached, ['InboxCommit.before', 'InboxCommit.after', 'InboxCommit.before']);
});

// Two writers read the same held reservations and each adds one for another
// attempt: SERIALIZABLE aborts one of them, which then reruns from scratch.
test('a lost serialization race reruns the whole transaction and then commits', async () => {
  const database = open();
  let bothRead: () => void = () => {};
  const barrier = new Promise<void>((resolve) => { bothRead = resolve; });
  let reads = 0;
  const runs = { first: 0, second: 0 };
  const writer = (name: 'first' | 'second', id: string) => database.transaction(async (tx) => {
    runs[name] += 1;
    const held = await tx.assignments.get(value(parseIdentifier('AssignmentId', 'assignment-0')));
    const seen = held.ok ? 1 : 0;
    if (runs[name] === 1 && ++reads === 2) bothRead();
    if (runs[name] === 1) await barrier;
    const added = await tx.assignments.add(assignment(id, `attempt-${id}`));
    if (!added.ok) return added;
    return tx.outbox.append(command(`offer-${id}-${seen}`));
  });
  const results = await Promise.all([writer('first', 'a'), writer('second', 'b')]);
  assert.deepEqual(results, [{ ok: true, value: undefined }, { ok: true, value: undefined }]);
  assert.deepEqual([runs.first, runs.second].sort(), [1, 2]);
  assert.deepEqual(await counts(), { assignments: 2, outbox: 2, inbox: 0 });
});

test('retries stop after the configured attempts with unavailable', async () => {
  assert.equal(SERIALIZATION_ATTEMPTS, 5);
  const database = open({ serializationAttempts: 1 });
  let bothRead: () => void = () => {};
  const barrier = new Promise<void>((resolve) => { bothRead = resolve; });
  let reads = 0;
  const writer = (id: string) => database.transaction(async (tx) => {
    await tx.assignments.get(value(parseIdentifier('AssignmentId', 'assignment-0')));
    if (++reads === 2) bothRead();
    await barrier;
    return tx.assignments.add(assignment(id, `attempt-${id}`));
  });
  const results = await Promise.all([writer('a'), writer('b')]);
  const failed = results.filter((result) => !result.ok);
  assert.equal(failed.length, 1);
  assert.equal(!failed[0]!.ok && failed[0]!.error.code, 'unavailable');
  assert.equal(!failed[0]!.ok && failed[0]!.error.details.attempts, '1');
});

test('a unique constraint is a conflict, and a defect in the work is rethrown', async () => {
  const database = open();
  assert.ok((await database.transaction((tx) => tx.assignments.add(assignment('assignment-1')))).ok);
  const offered = assignment('assignment-2');
  const released = value(endAssignment(offered, offered.generation, 'cancelled', { granted: false, nonTerminal: false }, AT));
  assert.ok((await database.transaction((tx) => tx.assignments.add(released))).ok);
  const reheld = await database.transaction((tx) => tx.assignments.replace(offered, released.generation));
  assert.equal(!reheld.ok && reheld.error.code, 'conflict');
  await assert.rejects(database.transaction(async (tx) => {
    await tx.assignments.add(assignment('assignment-3', 'attempt-3'));
    throw new RangeError('defect');
  }), RangeError);
  assert.deepEqual(await counts(), { assignments: 2, outbox: 0, inbox: 0 });
});

test('the relay reads unpublished messages in commit order and marks them once', async () => {
  const crashPoints = new CrashPoints();
  const database = open();
  const relay = new PostgresOutboxRelay(database, crashPoints);
  for (const id of ['b', 'a', 'c']) assert.ok((await database.transaction((tx) => tx.outbox.append(command(id)))).ok);
  assert.deepEqual(value(await relay.unpublished(2)).map((message) => message.metadata.eventId), ['b', 'a']);
  assert.ok((await relay.markPublished(command('b').metadata.eventId)).ok);
  assert.ok((await relay.markPublished(command('b').metadata.eventId)).ok);
  assert.deepEqual(value(await relay.unpublished(10)).map((message) => message.metadata.eventId), ['a', 'c']);
  const missing = await relay.markPublished(command('x').metadata.eventId);
  assert.equal(!missing.ok && missing.error.code, 'not-found');
  assert.deepEqual(crashPoints.reached, ['OutboxPublish.before', 'OutboxPublish.after', 'OutboxPublish.before', 'OutboxPublish.after', 'OutboxPublish.before']);
});

test('a crash before marking leaves the message to be published again', async () => {
  const database = open();
  assert.ok((await database.transaction((tx) => tx.outbox.append(command('a')))).ok);
  const relay = new PostgresOutboxRelay(database, new CrashPoints({ point: 'OutboxPublish.before', occurrence: 1, action: 'throw' }));
  await assert.rejects(relay.markPublished(command('a').metadata.eventId), SimulatedCrash);
  assert.deepEqual(value(await new PostgresOutboxRelay(database).unpublished(10)).map((message) => message.metadata.eventId), ['a']);
});

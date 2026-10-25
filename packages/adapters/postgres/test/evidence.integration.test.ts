import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { parseIdentifier } from '@taskelith/kernel';
import { PostgresDatabase } from '@taskelith/postgres';
import { refuseAssignment } from '@taskelith/scheduling';
import { value } from '@taskelith/testing';
import { AT, assignment } from './fixtures.ts';
import { createMigratedDatabase } from './test-database.ts';

const url = await createMigratedDatabase();
const database = new PostgresDatabase(url);
after(() => database.close());

const workerId = (text: string) => value(parseIdentifier('WorkerId', text));
const attemptId = (text: string) => value(parseIdentifier('AttemptId', text));

test('a worker held an attempt at the generations of its assignments, except a refused one', async () => {
  const held = assignment('assignment-1');
  const offered = assignment('assignment-2', 'attempt-2');
  const refused = value(refuseAssignment(offered, offered.generation, { workerId: offered.workerId, reason: 'worker-slots-exhausted' },
    { granted: false, nonTerminal: false }, AT));
  const stored = await database.transaction(async (tx) => {
    const added = await tx.assignments.add(held);
    if (!added.ok) return added;
    const second = await tx.assignments.add(offered);
    return second.ok ? tx.assignments.replace(refused, offered.generation) : second;
  });
  assert.equal(stored.ok, true);
  const generations = await database.transaction(async (tx) => {
    const results = await Promise.all([
      tx.producers.heldGenerations(workerId('worker-1'), attemptId('attempt-1')),
      tx.producers.heldGenerations(workerId('worker-2'), attemptId('attempt-1')),
      tx.producers.heldGenerations(workerId('worker-1'), attemptId('attempt-2')),
    ]);
    return { ok: true as const, value: results.map((result) => (result.ok ? result.value : result)) };
  });
  assert.deepEqual(generations, { ok: true, value: [[1], [], []] });
});

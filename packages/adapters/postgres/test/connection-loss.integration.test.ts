import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { parseIdentifier } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { SimulatedHost, Toxiproxy, acquireProcessLock, integrationEndpoint, value } from '@taskelith/testing';
import { PostgresDatabase } from '@taskelith/postgres';
import { AT, assignment } from './fixtures.ts';
import { PROXY_URL, assertNoPassword, createMigratedDatabase, databaseUrl, query } from './test-database.ts';

const toxiproxyUrl = integrationEndpoint('TASKELITH_TOXIPROXY_URL');
const toxiproxy = new Toxiproxy(toxiproxyUrl);
const route = toxiproxy.proxy('postgres');
const direct = await createMigratedDatabase();
const proxied = databaseUrl(PROXY_URL, direct.pathname.slice(1));
const sink = new InMemoryLogSink();
const logger = new Logger(sink, new SimulatedHost(AT).wallClock);
const database = new PostgresDatabase(proxied, { queryTimeoutMilliseconds: 1000, logger });
// Other test files partition the same Toxiproxy, so this one waits its turn.
const release = await acquireProcessLock(`toxiproxy-${toxiproxyUrl.port}`);
after(async () => {
  await database.close();
  await release();
});
afterEach(() => toxiproxy.reset());

const ID = value(parseIdentifier('AssignmentId', 'assignment-1'));

test('a lost connection makes a transaction unavailable, and the next one after the heal works', async () => {
  assert.ok((await database.transaction((tx) => tx.assignments.get(ID).then(() => ({ ok: true, value: undefined })))).ok);
  await route.disconnect();
  const lost = await database.transaction((tx) => tx.assignments.add(assignment('assignment-1')));
  assert.equal(!lost.ok && lost.error.code, 'unavailable');
  await route.heal();
  assert.ok((await database.transaction((tx) => tx.assignments.add(assignment('assignment-1')))).ok);
  assert.equal((await query(direct, 'SELECT id FROM assignments')).length, 1);
});

test('a connection lost during the work rolls the transaction back', async () => {
  const lost = await database.transaction(async (tx) => {
    await tx.assignments.add(assignment('assignment-2', 'attempt-2'));
    await route.disconnect();
    return tx.assignments.get(ID).then((read) => (read.ok ? { ok: true as const, value: undefined } : read));
  });
  assert.equal(!lost.ok && lost.error.code, 'unavailable');
  await route.heal();
  assert.deepEqual(await query(direct, "SELECT id FROM assignments WHERE id = 'assignment-2'"), []);
});

test('a rollback without an answer discards the connection instead of reusing it', async () => {
  const single = new PostgresDatabase(proxied, { queryTimeoutMilliseconds: 1000, maxConnections: 1 });
  try {
    const rejected = await single.transaction(async () => {
      await route.blackhole();
      return { ok: false as const, error: { code: 'precondition-failed' as const, message: 'rejected', details: {} } };
    });
    assert.equal(!rejected.ok && rejected.error.code, 'precondition-failed');
    await route.heal();
    assert.ok((await single.transaction((tx) => tx.assignments.add(assignment('assignment-4', 'attempt-4')))).ok);
  } finally {
    await single.close();
  }
});

test('a commit without an answer reports an unknown outcome instead of retrying', async () => {
  const unknown = await database.transaction(async (tx) => {
    const added = await tx.assignments.add(assignment('assignment-3', 'attempt-3'));
    await route.blackhole();
    return added;
  });
  assert.equal(!unknown.ok && unknown.error.code, 'unavailable');
  assert.equal(!unknown.ok && unknown.error.details.outcome, 'unknown');
  const logged = sink.records.find((record) => record.event === 'postgres.commit.unknown');
  assert.equal(logged?.level, 'error');
  assertNoPassword(JSON.stringify(sink.records), proxied.password);
});

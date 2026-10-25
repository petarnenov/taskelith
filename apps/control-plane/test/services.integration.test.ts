import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { integrationEndpoints, readNatsServerInfo, SERVICES_REMEDY } from './integration-services.ts';

const endpoints = integrationEndpoints();

test('PostgreSQL is reachable and is the pinned 18.6', async () => {
  const client = new pg.Client({ connectionString: endpoints.postgres.href, connectionTimeoutMillis: 5000 });
  try {
    await client.connect().catch((error: Error) => {
      throw new Error(`PostgreSQL at ${endpoints.postgres.host} is not reachable (${error.message}); ${SERVICES_REMEDY}`);
    });
    const { rows } = await client.query<{ server_version_num: string }>('SHOW server_version_num');
    assert.equal(rows[0]?.server_version_num, '180006');
  } finally {
    await client.end();
  }
});

test('NATS is reachable, is the pinned 2.15.1, and has JetStream enabled', async () => {
  const info = await readNatsServerInfo(endpoints.nats);
  assert.equal(info.version, '2.15.1');
  assert.equal(info.jetstream, true);
});

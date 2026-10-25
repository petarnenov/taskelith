import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { after, afterEach, test } from 'node:test';
import pg from 'pg';
import { Toxiproxy, acquireProcessLock, integrationEndpoint } from '@taskelith/testing';

const toxiproxyUrl = integrationEndpoint('TASKELITH_TOXIPROXY_URL');
const toxiproxy = new Toxiproxy(toxiproxyUrl);
const postgresRoute = integrationEndpoint('TASKELITH_POSTGRES_PROXY_URL');
const natsRoute = integrationEndpoint('TASKELITH_NATS_PROXY_URL');

// Test files run in parallel, and each one partitions the shared routes.
const release = await acquireProcessLock(`toxiproxy-${toxiproxyUrl.port}`);
after(release);
afterEach(() => toxiproxy.reset());

type Greeting = 'info' | 'unexpected' | 'closed' | 'silent';

// What a client sees of the NATS greeting within the wait: the INFO line,
// other data, a closed connection, or nothing.
function natsGreeting(url: URL, waitMilliseconds = 1000): Promise<Greeting> {
  return new Promise((resolve) => {
    const socket = connect({ host: url.hostname, port: Number(url.port) });
    const settle = (greeting: Greeting) => {
      socket.destroy();
      resolve(greeting);
    };
    socket.setTimeout(waitMilliseconds, () => settle('silent'));
    socket.on('data', (chunk) => settle(chunk.toString('utf8').startsWith('INFO ') ? 'info' : 'unexpected'));
    socket.on('close', () => settle('closed'));
    socket.on('error', () => settle('closed'));
  });
}

async function postgresAnswers(client: pg.Client): Promise<boolean> {
  try {
    const { rows } = await client.query<{ answer: number }>('SELECT 1 AS answer');
    return rows[0]?.answer === 1;
  } catch {
    return false;
  }
}

function postgresClient(): pg.Client {
  const client = new pg.Client({ connectionString: postgresRoute.href, connectionTimeoutMillis: 2000, query_timeout: 1000 });
  client.on('error', () => {});
  return client;
}

test('a disconnected NATS route closes connections until it is healed', async () => {
  const nats = toxiproxy.proxy('nats');
  assert.equal(await natsGreeting(natsRoute), 'info');
  await nats.disconnect();
  assert.equal(await natsGreeting(natsRoute), 'closed');
  await nats.heal();
  assert.equal(await natsGreeting(natsRoute), 'info');
});

test('a black-holed NATS route keeps the connection open but silent', async () => {
  const nats = toxiproxy.proxy('nats');
  await nats.blackhole();
  assert.equal(await natsGreeting(natsRoute), 'silent');
  await nats.heal();
  assert.equal(await natsGreeting(natsRoute), 'info');
});

test('a black hole stalls an open PostgreSQL session, and a new one works after the heal', async () => {
  const postgres = toxiproxy.proxy('postgres');
  const stalled = postgresClient();
  await stalled.connect();
  try {
    assert.equal(await postgresAnswers(stalled), true);
    await postgres.blackhole();
    assert.equal(await postgresAnswers(stalled), false);
  } finally {
    await postgres.heal();
    await stalled.end().catch(() => {});
  }
  const fresh = postgresClient();
  await fresh.connect();
  try {
    assert.equal(await postgresAnswers(fresh), true);
  } finally {
    await fresh.end();
  }
});

test('a disconnected PostgreSQL route refuses new sessions until it is healed', async () => {
  const postgres = toxiproxy.proxy('postgres');
  await postgres.disconnect();
  await assert.rejects(postgresClient().connect());
  await postgres.heal();
  const client = postgresClient();
  await client.connect();
  try {
    assert.equal(await postgresAnswers(client), true);
  } finally {
    await client.end();
  }
});

test('a failed API call names the method, the path, and the status', async () => {
  await assert.rejects(toxiproxy.proxy('missing').disconnect(), /Toxiproxy POST \/proxies\/missing failed with 404: .*proxy not found/);
});

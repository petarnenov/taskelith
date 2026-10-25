import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, afterEach, test } from 'node:test';
import type { NatsConnection } from '@nats-io/nats-core';
import { ok } from '@taskelith/kernel';
import { connectWorkerTransport, encodeJson, JetStreamPublisher, workerCommandConsumer } from '@taskelith/nats';
import { acquireProcessLock, crashEnvironment, integrationEndpoint, integrationSecret, ScenarioProcess, Toxiproxy } from '@taskelith/testing';
import { offer } from './messages.ts';
import { connected, expectOk, installation, NATS_URL, recordingHandler, running, TEST_LIMITS, waitFor } from './nats-fixtures.ts';

const PUBLISHER = join(import.meta.dirname, 'fixtures', 'crashing-publisher.ts');
const toxiproxyUrl = integrationEndpoint('TASKELITH_TOXIPROXY_URL');
const toxiproxy = new Toxiproxy(toxiproxyUrl);
const route = toxiproxy.proxy('nats');
const PROXY_URL = integrationEndpoint('TASKELITH_NATS_PROXY_URL');
// Other test files partition the same Toxiproxy, so this one waits its turn.
const release = await acquireProcessLock(`toxiproxy-${toxiproxyUrl.port}`);
after(() => release());
afterEach(() => toxiproxy.reset());

function connectionStatuses(connection: NatsConnection): string[] {
  const seen: string[] = [];
  void (async () => {
    for await (const status of connection.status()) seen.push(status.type);
  })();
  return seen;
}

async function publishWithCrashAt(installationId: string, point?: string): Promise<{ signal: string | null; stdout: string }> {
  const env = { ...process.env, ...(point === undefined ? {} : crashEnvironment(point)) };
  const child = await ScenarioProcess.start(process.execPath, ['--experimental-strip-types', PUBLISHER, NATS_URL.href, installationId], { env });
  const timer = setTimeout(() => child.kill(), 30_000);
  const exit = await child.exited.finally(() => clearTimeout(timer));
  assert.equal(child.stderr, '', `the publisher wrote to stderr (exit ${exit.code})`);
  return { signal: exit.signal, stdout: child.stdout };
}

// R05: a publisher killed after the broker stored a row but before the outbox
// marked it publishes the row again, and the worker receives it once.
test('a publisher killed between the broker ack and the outbox mark republishes under the same identity', async () => {
  const { address, transport } = await installation(['worker-1']);
  assert.deepEqual(await publishWithCrashAt(address.installationId, 'OutboxPublish.before'), { signal: 'SIGKILL', stdout: '' });
  assert.equal((await transport.jsm.streams.info(address.streamName('commands'))).state.messages, 1);

  const rerun = await publishWithCrashAt(address.installationId);
  assert.deepEqual(rerun, { signal: null, stdout: `${JSON.stringify(ok({ published: 1, deferred: 0 }))}\n` });
  assert.equal((await transport.jsm.streams.info(address.streamName('commands'))).state.messages, 1);
  const handler = recordingHandler();
  running((signal) => workerCommandConsumer(transport.js, address, 'worker-1', handler.handle, { limits: TEST_LIMITS }).run(signal));
  await waitFor(() => handler.deliveries.length === 1);
});

test('a publication during a lost connection is unavailable, and its retry after the heal is stored once', async () => {
  const { address, transport } = await installation(['worker-1']);
  const proxied = await connected(PROXY_URL, address);
  after(() => proxied.close());
  const subject = expectOk(address.commandSubject('worker-1'));
  const body = encodeJson(offer('command-1'));
  const publisher = new JetStreamPublisher(proxied.js);

  await route.disconnect();
  const lost = await publisher.publish({ subject, body, messageId: 'command-1' });
  assert.equal(!lost.ok && lost.error.code, 'unavailable');
  await route.heal();
  await waitFor(async () => (await publisher.publish({ subject, body, messageId: 'command-1' })).ok, 20_000);
  assert.equal((await transport.jsm.streams.info(address.streamName('commands'))).state.messages, 1);
});

test('a worker consumer resumes after a lost connection and receives what was published meanwhile', async () => {
  const { address, transport } = await installation(['worker-1']);
  const proxied = expectOk(await connectWorkerTransport({
    server: PROXY_URL, address, workerId: 'worker-1', creds: integrationSecret('integration.creds'),
  }));
  after(() => proxied.close());
  const subject = expectOk(address.commandSubject('worker-1'));
  const direct = new JetStreamPublisher(transport.js);
  const handler = recordingHandler();
  const statuses = connectionStatuses(proxied.connection);
  const options = { limits: TEST_LIMITS, fetchExpiresMilliseconds: 1000 };
  running((signal) => workerCommandConsumer(proxied.js, address, 'worker-1', handler.handle, options).run(signal));

  expectOk(await direct.publish({ subject, body: encodeJson(offer('command-1')), messageId: 'command-1' }));
  await waitFor(() => handler.deliveries.length === 1);
  await route.disconnect();
  expectOk(await direct.publish({ subject, body: encodeJson(offer('command-2')), messageId: 'command-2' }));
  await waitFor(() => statuses.includes('disconnect'));
  await route.heal();
  await waitFor(() => statuses.includes('reconnect'), 20_000);

  await waitFor(() => handler.deliveries.length === 2, 20_000);
  assert.deepEqual(handler.deliveries.map((d) => d.identity), ['command-1', 'command-2']);
});

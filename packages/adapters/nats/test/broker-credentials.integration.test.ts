import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { NatsConnection } from '@nats-io/nats-core';
import { connect, credsAuthenticator } from '@nats-io/transport-node';
import { installationIdentity, parseWorkerId } from '@taskelith/fleet';
import {
  BrokerAuthority,
  connectWorkerTransport,
  encodeJson,
  JetStreamPublisher,
  NatsBrokerCredentials,
  workerCommandConsumer,
  type BrokerAuthorityKeys,
} from '@taskelith/nats';
import { failed, integrationSecret, value } from '@taskelith/testing';
import { parseInstant } from '@taskelith/kernel';

const nowInstant = () => value(parseInstant(new Date().toISOString()));
import { offer } from './messages.ts';
import { expectOk, installation, NATS_URL, recordingHandler, running, TEST_LIMITS, waitFor } from './nats-fixtures.ts';

const authority = value(BrokerAuthority.fromKeys(JSON.parse(integrationSecret('authority.json')) as BrokerAuthorityKeys));
const system = await connect({
  servers: NATS_URL.href, tls: null,
  authenticator: credsAuthenticator(new TextEncoder().encode(integrationSecret('system.creds'))),
});
after(() => system.close());
const broker = new NatsBrokerCredentials(authority, system);

function statuses(connection: NatsConnection): string[] {
  const seen: string[] = [];
  void (async () => {
    for await (const status of connection.status()) seen.push(status.type === 'error' ? `error:${status.error.message}` : status.type);
  })();
  return seen;
}

async function workerSetup(workerId: string) {
  const { address, transport } = await installation([workerId]);
  const identity = value(installationIdentity(address.installationId, 1));
  const issued = expectOk(await broker.issue(identity, value(parseWorkerId(workerId)), 1));
  return { address, transport, issued };
}

test('a worker user reads only its own commands and publishes only its own observations', async () => {
  const { address, transport, issued } = await workerSetup('worker-1');
  expectOk(await new JetStreamPublisher(transport.js).publish({
    subject: expectOk(address.commandSubject('worker-1')), body: encodeJson(offer('command-1')), messageId: 'command-1',
  }));
  const worker = expectOk(await connectWorkerTransport({ server: NATS_URL, address, workerId: 'worker-1', creds: issued.creds }));
  after(() => worker.close());
  const seen = statuses(worker.connection);
  const handler = recordingHandler();
  running((signal) => workerCommandConsumer(worker.js, address, 'worker-1', handler.handle, { limits: TEST_LIMITS, fetchExpiresMilliseconds: 1000 }).run(signal));
  await waitFor(() => handler.deliveries.length === 1);

  worker.connection.publish(expectOk(address.observationSubject('worker-2')), 'forged');
  worker.connection.publish(expectOk(address.commandSubject('worker-1')), 'self-command');
  await worker.connection.flush();
  await waitFor(() => seen.filter((status) => status.startsWith('error:Permissions Violation for Publish')).length === 2);
  const other = await connectWorkerTransport({ server: NATS_URL, address, workerId: 'worker-2', creds: issued.creds });
  assert.ok(other.ok, 'connecting succeeds; the prefix of another worker only denies its replies');
  await other.value.close();
});

test('a revoked worker is disconnected at once and cannot connect again, without a server reload', async () => {
  const { address, issued } = await workerSetup('worker-1');
  const worker = expectOk(await connectWorkerTransport({ server: NATS_URL, address, workerId: 'worker-1', creds: issued.creds }));
  const seen = statuses(worker.connection);
  after(() => worker.close());

  expectOk(await broker.publishRevocations([{ userKey: issued.userKey, revokedAt: nowInstant() }]));
  await waitFor(() => seen.includes('error:User Authentication Revoked'));
  const again = failed(await connectWorkerTransport({ server: NATS_URL, address, workerId: 'worker-1', creds: issued.creds }));
  assert.equal(again.code, 'unavailable');
  assert.match(again.details.cause ?? '', /Authorization Violation/);
});

test('a published list replaces the previous one: listed users are refused, others accepted', async () => {
  const { address } = await workerSetup('worker-1');
  const identity = value(installationIdentity(address.installationId, 1));
  const first = expectOk(await broker.issue(identity, value(parseWorkerId('worker-1')), 2));
  const second = expectOk(await broker.issue(identity, value(parseWorkerId('worker-1')), 3));
  const third = expectOk(await broker.issue(identity, value(parseWorkerId('worker-1')), 4));
  expectOk(await broker.publishRevocations([{ userKey: first.userKey, revokedAt: nowInstant() }]));
  expectOk(await broker.publishRevocations([first, second].map(({ userKey }) => ({ userKey, revokedAt: nowInstant() }))));
  const accepted = expectOk(await connectWorkerTransport({ server: NATS_URL, address, workerId: 'worker-1', creds: third.creds }));
  await accepted.close();

  for (const issued of [first, second]) {
    assert.equal((await connectWorkerTransport({ server: NATS_URL, address, workerId: 'worker-1', creds: issued.creds })).ok, false);
  }
});

test('a connection with the configured CA uses TLS, and one with another CA fails', async () => {
  const { address, issued } = await workerSetup('worker-1');
  const secure = expectOk(await connectWorkerTransport({
    server: NATS_URL, address, workerId: 'worker-1', creds: issued.creds, tls: { ca: integrationSecret('ca.pem') },
  }));
  after(() => secure.close());
  assert.equal(secure.connection.info?.tls_available, true);
  const wrong = await connectWorkerTransport({
    server: NATS_URL, address, workerId: 'worker-1', creds: issued.creds, tls: { ca: integrationSecret('server-cert.pem') },
  });
  assert.equal(wrong.ok, false);
});

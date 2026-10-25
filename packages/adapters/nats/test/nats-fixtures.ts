import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after } from 'node:test';
import {
  connectTransport,
  ensureAdvisoryConsumer,
  ensureObservationConsumer,
  ensureStreams,
  ensureWorkerConsumer,
  TRANSPORT_LIMITS,
  TransportAddress,
  type DeliveredMessage,
  type ControlPlaneConnection,
  type TransportLimits,
} from '@taskelith/nats';
import { integrationEndpoint, integrationSecret } from '@taskelith/testing';
import { ok, type Result } from '@taskelith/kernel';

export const NATS_URL = integrationEndpoint('TASKELITH_NATS_URL');

// Short timers, so that redelivery and exhaustion take seconds in a test.
export const TEST_LIMITS: TransportLimits = {
  ...TRANSPORT_LIMITS,
  // The test server keeps JetStream in a small tmpfs, which reserves bytes.
  streamMaxBytes: 64 * 1024 ** 2,
  ackWaitMilliseconds: 1500,
  maxDeliver: 3,
  retryInitialMilliseconds: 100,
  retryMaxMilliseconds: 200,
  idlePollMilliseconds: 50,
};

// Each test gets an installation of its own, since test files share the
// server; its streams are deleted when the file ends.
export async function installation(workers: readonly string[], server = NATS_URL): Promise<{
  address: TransportAddress;
  transport: ControlPlaneConnection;
}> {
  const address = TransportAddress.of(`it${randomUUID().replaceAll('-', '').slice(0, 12)}`);
  assert.ok(address.ok);
  const transport = await connected(server, address.value);
  after(async () => {
    for (const kind of ['commands', 'observations', 'quarantine', 'advisories'] as const) {
      await transport.jsm.streams.delete(address.value.streamName(kind)).catch(() => false);
    }
    await transport.close();
  });
  expectOk(await ensureStreams(transport.jsm, address.value, TEST_LIMITS));
  expectOk(await ensureAdvisoryConsumer(transport.jsm, address.value, TEST_LIMITS));
  for (const worker of workers) expectOk(await ensureWorkerConsumer(transport.jsm, address.value, worker, TEST_LIMITS));
  return { address: address.value, transport };
}

export async function connected(server: URL, address: TransportAddress): Promise<ControlPlaneConnection> {
  const transport = await connectTransport({ server, address, creds: integrationSecret('integration.creds') });
  assert.ok(transport.ok, transport.ok ? '' : transport.error.message);
  return transport.value;
}

export async function observationReader(transport: ControlPlaneConnection, address: TransportAddress, name: string): Promise<void> {
  expectOk(await ensureObservationConsumer(transport.jsm, address, name, TEST_LIMITS));
}

export function expectOk<T>(result: Result<T>): T {
  assert.ok(result.ok, result.ok ? '' : `${result.error.code}: ${result.error.message} ${JSON.stringify(result.error.details)}`);
  return result.value;
}

// Records every delivery and answers with the next scripted result, ok once
// the script runs out.
export function recordingHandler(script: Array<Result<unknown>> = []) {
  const deliveries: DeliveredMessage[] = [];
  const handle = async (message: DeliveredMessage): Promise<Result<unknown>> => {
    deliveries.push(message);
    return script.shift() ?? ok(undefined);
  };
  return { deliveries, handle };
}

// Runs a consumer loop until the test ends.
export function running(run: (signal: AbortSignal) => Promise<void>): AbortController {
  const controller = new AbortController();
  const loop = run(controller.signal);
  after(async () => {
    controller.abort();
    await loop;
  });
  return controller;
}

export async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const startedAt = Date.now();
  while (!(await condition())) {
    if (Date.now() - startedAt > timeoutMs) throw new Error(`condition not met within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

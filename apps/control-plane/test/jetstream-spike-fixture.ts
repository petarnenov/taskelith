import { connect, credsAuthenticator } from '@nats-io/transport-node';
import { integrationSecret } from '@taskelith/testing';
import type { NatsConnection } from '@nats-io/nats-core';
import { AckPolicy, jetstreamManager, StorageType } from '@nats-io/jetstream';
import type { ConsumerConfig, JetStreamManager, JsMsg, StreamConfig } from '@nats-io/jetstream';
import { integrationEndpoints } from './integration-services.ts';

// Names and users match the spike users that scripts/integration-broker.ts
// issues with the spike's permissions.
export const COMMAND_STREAM = 'SPIKE_CMD';
export const OBSERVATION_STREAM = 'SPIKE_OBS';
export const QUARANTINE_STREAM = 'SPIKE_QUARANTINE';
export const ADVISORY_STREAM = 'SPIKE_ADVISORIES';
export const WORKERS = ['worker-a', 'worker-b'] as const;
export type WorkerId = (typeof WORKERS)[number];

export const SECOND_NS = 1_000_000_000;

export function commandSubject(worker: WorkerId): string {
  return `spike.cmd.${worker}`;
}

export function observationSubject(worker: WorkerId): string {
  return `spike.obs.${worker}`;
}

export function connectAsIntegration(): Promise<NatsConnection> {
  return connect({ servers: integrationEndpoints().nats.href, authenticator: creds('integration'), tls: null });
}

export function connectAsWorker(worker: WorkerId, inboxPrefix = `_INBOX.${worker}`): Promise<NatsConnection> {
  return connect({ servers: integrationEndpoints().nats.href, authenticator: creds(worker), inboxPrefix, tls: null });
}

function creds(user: string) {
  return credsAuthenticator(new TextEncoder().encode(integrationSecret(`${user}.creds`)));
}

export async function recreateStream(jsm: JetStreamManager, config: Partial<StreamConfig> & { name: string }): Promise<void> {
  await jsm.streams.delete(config.name).catch(() => false);
  await jsm.streams.add({ storage: StorageType.File, ...config });
}

export async function addWorkerConsumer(jsm: JetStreamManager, worker: WorkerId, config: Partial<ConsumerConfig> = {}): Promise<void> {
  await jsm.consumers.add(COMMAND_STREAM, {
    durable_name: worker,
    filter_subject: commandSubject(worker),
    ack_policy: AckPolicy.Explicit,
    ...config,
  });
}

// One command stream on worker-addressed subjects, one consumer per worker.
export async function recreateCommandTopology(
  nc: NatsConnection,
  stream: Partial<StreamConfig> = {},
  consumer: Partial<ConsumerConfig> = {},
): Promise<JetStreamManager> {
  const jsm = await jetstreamManager(nc);
  await recreateStream(jsm, { name: COMMAND_STREAM, subjects: ['spike.cmd.*'], ...stream });
  for (const worker of WORKERS) await addWorkerConsumer(jsm, worker, consumer);
  return jsm;
}

export interface Delivery {
  readonly body: string;
  readonly streamSequence: number;
  readonly deliveryCount: number;
  readonly redelivered: boolean;
  readonly receivedAt: number;
}

export function toDelivery(message: JsMsg): Delivery {
  return {
    body: message.string(),
    streamSequence: message.seq,
    deliveryCount: message.info.deliveryCount,
    redelivered: message.info.redelivered,
    receivedAt: performance.now(),
  };
}

export function millisecondsSince(start: number, end = performance.now()): number {
  return Math.round(end - start);
}

// Polls until a condition holds, so a server-side timer needs no fixed sleep.
export async function waitFor(condition: () => Promise<boolean>, timeoutMs: number): Promise<number> {
  const startedAt = performance.now();
  while (!(await condition())) {
    if (performance.now() - startedAt > timeoutMs) throw new Error(`condition not met within ${timeoutMs} ms`);
    await delay(50);
  }
  return millisecondsSince(startedAt);
}

// Collects the asynchronous permission errors that the server reports.
export function collectServerErrors(nc: NatsConnection): string[] {
  const errors: string[] = [];
  void (async () => {
    for await (const status of nc.status()) {
      if (status.type === 'error') errors.push(status.error.message);
    }
  })();
  return errors;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

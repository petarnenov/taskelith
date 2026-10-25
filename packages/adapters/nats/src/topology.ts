import {
  AckPolicy,
  DiscardPolicy,
  JetStreamApiCodes,
  JetStreamApiError,
  RetentionPolicy,
  StorageType,
  type ConsumerConfig,
  type JetStreamManager,
  type StreamConfig,
} from '@nats-io/jetstream';
import { nanos } from '@nats-io/nats-core';
import { ok, type Result } from '@taskelith/kernel';
import { brokerFailure } from './broker-failure.js';
import type { StreamKind, TransportAddress } from './transport-address.js';
import { TRANSPORT_LIMITS, type TransportLimits } from './transport-limits.js';

const ADVISORY_KINDS = ['MAX_DELIVERIES', 'MSG_TERMINATED'] as const;

// Creates or updates the streams of decision D3 (a): commands on worker
// subjects, observations, and the quarantine with its advisory capture.
export async function ensureStreams(
  jsm: JetStreamManager,
  address: TransportAddress,
  limits: TransportLimits = TRANSPORT_LIMITS,
): Promise<Result<void>> {
  try {
    for (const config of streamConfigs(address, limits)) await ensureStream(jsm, config);
    return ok(undefined);
  } catch (error) {
    return brokerFailure('ensure the streams', error);
  }
}

// The durable pull consumer that only this worker reads, on its own subject.
export async function ensureWorkerConsumer(
  jsm: JetStreamManager,
  address: TransportAddress,
  workerId: string,
  limits: TransportLimits = TRANSPORT_LIMITS,
): Promise<Result<void>> {
  const subject = address.commandSubject(workerId);
  if (!subject.ok) return subject;
  return ensureConsumer(jsm, address.streamName('commands'), {
    ...deliveryConfig(workerId, subject.value, limits),
    max_ack_pending: limits.maxAckPendingPerWorker,
  });
}

// Deletes a revoked worker's consumer; one already gone, with or without
// its stream, counts as removed.
export async function removeWorkerConsumer(jsm: JetStreamManager, address: TransportAddress, workerId: string): Promise<Result<void>> {
  try {
    await jsm.consumers.delete(address.streamName('commands'), workerId);
    return ok(undefined);
  } catch (error) {
    if (isAbsent(error)) return ok(undefined);
    return brokerFailure(`remove consumer ${workerId}`, error);
  }
}

function isAbsent(error: unknown): boolean {
  const absent: number[] = [JetStreamApiCodes.ConsumerNotFound, JetStreamApiCodes.StreamNotFound];
  return error instanceof JetStreamApiError && absent.includes(error.code);
}

// One independent consumer per reader of every worker's observations.
export function ensureObservationConsumer(
  jsm: JetStreamManager,
  address: TransportAddress,
  name: string,
  limits: TransportLimits = TRANSPORT_LIMITS,
): Promise<Result<void>> {
  const subjects = address.allWorkerSubjects('observations');
  return ensureConsumer(jsm, address.streamName('observations'), deliveryConfig(name, subjects, limits));
}

// The quarantine keeper's consumer of the captured advisories.
export function ensureAdvisoryConsumer(
  jsm: JetStreamManager,
  address: TransportAddress,
  limits: TransportLimits = TRANSPORT_LIMITS,
): Promise<Result<void>> {
  return ensureConsumer(jsm, address.streamName('advisories'), {
    durable_name: 'quarantine',
    ack_policy: AckPolicy.Explicit,
    ack_wait: nanos(limits.ackWaitMilliseconds),
  });
}

export function streamConfigs(
  address: TransportAddress,
  limits: TransportLimits = TRANSPORT_LIMITS,
): Array<Partial<StreamConfig> & { name: string }> {
  const bounded = {
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    discard: DiscardPolicy.New,
    max_age: nanos(limits.streamMaxAgeMilliseconds),
    max_bytes: limits.streamMaxBytes,
    max_msg_size: limits.messageMaxBytes,
    duplicate_window: nanos(limits.duplicateWindowMilliseconds),
  };
  const sources: StreamKind[] = ['commands', 'observations'];
  return [
    {
      ...bounded,
      name: address.streamName('commands'),
      subjects: [address.allWorkerSubjects('commands')],
      max_msgs_per_subject: limits.commandBacklogPerWorker,
      discard_new_per_subject: true,
    },
    { ...bounded, name: address.streamName('observations'), subjects: [address.allWorkerSubjects('observations')] },
    { ...bounded, name: address.streamName('sdlc'), subjects: [address.sdlcEventsSubject()] },
    {
      // A copy carries diagnostic headers beside a body of up to the limit.
      ...bounded,
      max_msg_size: -1,
      name: address.streamName('quarantine'),
      subjects: sources.map((source) => address.quarantineSubject(source)),
    },
    {
      ...bounded,
      name: address.streamName('advisories'),
      subjects: sources.flatMap((source) => ADVISORY_KINDS.map((kind) => advisorySubject(kind, address.streamName(source)))),
    },
  ];
}

function advisorySubject(kind: (typeof ADVISORY_KINDS)[number], stream: string): string {
  return `$JS.EVENT.ADVISORY.CONSUMER.${kind}.${stream}.*`;
}

// Acknowledgement only after the receiver committed, redelivery after
// `ack_wait`, and quarantine after `max_deliver` (JetStream spike).
function deliveryConfig(durable: string, filterSubject: string, limits: TransportLimits): Partial<ConsumerConfig> {
  return {
    durable_name: durable,
    filter_subject: filterSubject,
    ack_policy: AckPolicy.Explicit,
    ack_wait: nanos(limits.ackWaitMilliseconds),
    max_deliver: limits.maxDeliver,
  };
}

async function ensureStream(jsm: JetStreamManager, config: Partial<StreamConfig> & { name: string }): Promise<void> {
  if (await exists(() => jsm.streams.info(config.name), JetStreamApiCodes.StreamNotFound)) {
    await jsm.streams.update(config.name, config);
  } else {
    await jsm.streams.add(config);
  }
}

async function ensureConsumer(jsm: JetStreamManager, stream: string, config: Partial<ConsumerConfig>): Promise<Result<void>> {
  const name = config.durable_name!;
  try {
    if (await exists(() => jsm.consumers.info(stream, name), JetStreamApiCodes.ConsumerNotFound)) {
      await jsm.consumers.update(stream, name, config);
    } else {
      await jsm.consumers.add(stream, config);
    }
    return ok(undefined);
  } catch (error) {
    return brokerFailure(`ensure consumer ${name}`, error);
  }
}

async function exists(info: () => Promise<unknown>, notFound: number): Promise<boolean> {
  try {
    await info();
    return true;
  } catch (error) {
    if (error instanceof JetStreamApiError && error.code === notFound) return false;
    throw error;
  }
}

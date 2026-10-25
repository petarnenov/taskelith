import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { headers } from '@nats-io/nats-core';
import type { NatsConnection } from '@nats-io/nats-core';
import { DiscardPolicy, jetstream, JetStreamApiError, jetstreamManager } from '@nats-io/jetstream';
import type { JetStreamClient, JetStreamManager } from '@nats-io/jetstream';
import {
  ADVISORY_STREAM,
  COMMAND_STREAM,
  collectServerErrors,
  commandSubject,
  connectAsIntegration,
  connectAsWorker,
  delay,
  millisecondsSince,
  observationSubject,
  OBSERVATION_STREAM,
  QUARANTINE_STREAM,
  recreateCommandTopology,
  recreateStream,
  SECOND_NS,
  toDelivery,
  type Delivery,
  waitFor,
} from './jetstream-spike-fixture.ts';

// Measurements for docs/g2-jetstream-spike.md (G2 item 2).
let nc: NatsConnection;
let js: JetStreamClient;

before(async () => {
  nc = await connectAsIntegration();
  js = jetstream(nc);
});

after(async () => {
  const jsm = await jetstreamManager(nc);
  for (const stream of [COMMAND_STREAM, OBSERVATION_STREAM, QUARANTINE_STREAM, ADVISORY_STREAM, 'SPIKE_LIMITS']) {
    await jsm.streams.delete(stream).catch(() => false);
  }
  await nc.close();
});

async function fetchDeliveries(stream: string, consumer: string, maxMessages: number, expiresMs: number): Promise<Delivery[]> {
  const messages = await (await js.consumers.get(stream, consumer)).fetch({ max_messages: maxMessages, expires: expiresMs });
  const deliveries: Delivery[] = [];
  for await (const message of messages) deliveries.push(toDelivery(message));
  return deliveries;
}

test('nats.js 3.4.0 works against the pinned nats-server 2.15.1', async (t) => {
  const account = await (await jetstreamManager(nc)).getAccountInfo();
  t.diagnostic(`server ${nc.info?.version}, JetStream API level ${account.api.level}`);
  t.diagnostic(`max_payload ${nc.info?.max_payload}, Node ${process.version}`);
  assert.equal(nc.info?.version, '2.15.1');
  assert.equal(nc.info?.jetstream, true);
  assert.equal(nc.info?.max_payload, 1024 * 1024);
});

test('the client refuses a pull expiry below 1000 ms', async () => {
  await recreateCommandTopology(nc);
  const consumer = await js.consumers.get(COMMAND_STREAM, 'worker-a');
  await assert.rejects(consumer.fetch({ expires: 999 }), /'expires' must be at least 1000ms/);
});

test('each worker consumer receives only the commands addressed to it', async () => {
  await recreateCommandTopology(nc);
  await js.publish(commandSubject('worker-a'), 'a-1');
  await js.publish(commandSubject('worker-b'), 'b-1');
  await js.publish(commandSubject('worker-a'), 'a-2');

  const forA = await fetchDeliveries(COMMAND_STREAM, 'worker-a', 10, 1000);
  const forB = await fetchDeliveries(COMMAND_STREAM, 'worker-b', 10, 1000);

  assert.deepEqual(forA.map((d) => d.body), ['a-1', 'a-2']);
  assert.deepEqual(forB.map((d) => d.body), ['b-1']);
});

test('a plain acknowledgement settles a command', async () => {
  await recreateCommandTopology(nc);
  await js.publish(commandSubject('worker-a'), 'settled');
  const message = await (await js.consumers.get(COMMAND_STREAM, 'worker-a')).next({ expires: 1000 });

  message?.ack();
  await nc.flush();

  const info = await (await jetstreamManager(nc)).consumers.info(COMMAND_STREAM, 'worker-a');
  assert.deepEqual([info.num_ack_pending, info.num_pending, info.ack_floor.stream_seq], [0, 0, message?.seq]);
});

describe('explicit acknowledgement and redelivery', () => {
  test('an unacknowledged command returns every ack_wait; an acked one does not', async (t) => {
    await recreateCommandTopology(nc, {}, { ack_wait: SECOND_NS });
    await js.publish(commandSubject('worker-a'), 'unacked');
    await js.publish(commandSubject('worker-a'), 'acked');
    const consumer = await js.consumers.get(COMMAND_STREAM, 'worker-a');
    const first: Delivery[] = [];
    for await (const message of await consumer.fetch({ max_messages: 2, expires: 1000 })) {
      first.push(toDelivery(message));
      if (message.string() === 'acked') assert.equal(await message.ackAck(), true);
    }

    const again: Delivery[] = [];
    for await (const message of await consumer.fetch({ max_messages: 10, expires: 2600 })) again.push(toDelivery(message));

    assert.deepEqual(first.map((d) => [d.body, d.deliveryCount]), [['unacked', 1], ['acked', 1]]);
    assert.deepEqual(again.map((d) => [d.body, d.deliveryCount, d.redelivered]), [['unacked', 2, true], ['unacked', 3, true]]);
    const intervals = again.map((d) => millisecondsSince(first[0]?.receivedAt ?? 0, d.receivedAt));
    t.diagnostic(`redelivered ${intervals.join(' and ')} ms after the first delivery (ack_wait 1000 ms)`);
    assert.ok((intervals[0] ?? 0) >= 900 && (intervals[1] ?? 0) >= 1900);
  });

  test('a negative acknowledgement with a delay redelivers after that delay', async (t) => {
    await recreateCommandTopology(nc, {}, { ack_wait: 30 * SECOND_NS });
    await js.publish(commandSubject('worker-a'), 'retry-later');
    const consumer = await js.consumers.get(COMMAND_STREAM, 'worker-a');
    const first = await consumer.next({ expires: 1000 });
    const nakAt = performance.now();
    first?.nak(700);

    const again = await consumer.next({ expires: 2000 });

    const interval = millisecondsSince(nakAt);
    t.diagnostic(`redelivered ${interval} ms after nak(700)`);
    assert.equal(again?.info.deliveryCount, 2);
    assert.ok(interval >= 650);
  });
});

describe('outstanding-acknowledgement and payload bounds', () => {
  test('max_ack_pending caps the unacknowledged commands a worker holds', async () => {
    await recreateCommandTopology(nc, {}, { max_ack_pending: 2, ack_wait: 30 * SECOND_NS });
    for (let i = 1; i <= 5; i++) await js.publish(commandSubject('worker-a'), `c-${i}`);

    const held = await fetchDeliveries(COMMAND_STREAM, 'worker-a', 5, 1000);

    assert.deepEqual(held.map((d) => d.body), ['c-1', 'c-2']);
    const info = await (await jetstreamManager(nc)).consumers.info(COMMAND_STREAM, 'worker-a');
    assert.equal(info.num_ack_pending, 2);
    assert.equal(info.num_pending, 3);
  });

  test('the client rejects a payload above the server max_payload', async () => {
    const oversized = new Uint8Array((nc.info?.max_payload ?? 0) + 1);
    await assert.rejects(js.publish(commandSubject('worker-a'), oversized), /max_payload size exceeded/);
  });

  test('a stream max_msg_size rejects a larger message with API error 10054', async () => {
    await recreateCommandTopology(nc, { max_msg_size: 1024 });
    await js.publish(commandSubject('worker-a'), new Uint8Array(900));
    await assert.rejects(js.publish(commandSubject('worker-a'), new Uint8Array(1025)), (error: unknown) => {
      assert.ok(error instanceof JetStreamApiError);
      assert.equal(error.code, 10054);
      return true;
    });
  });
});

test('the deduplication window drops a repeat only while the window lasts', async () => {
  await recreateCommandTopology(nc, { duplicate_window: SECOND_NS });

  const first = await js.publish(commandSubject('worker-a'), 'cmd', { msgID: 'command-1' });
  const repeat = await js.publish(commandSubject('worker-a'), 'cmd', { msgID: 'command-1' });
  await delay(1300);
  const late = await js.publish(commandSubject('worker-a'), 'cmd', { msgID: 'command-1' });

  assert.deepEqual([repeat.duplicate, repeat.seq], [true, first.seq]);
  assert.equal(late.duplicate, false);
  assert.equal(late.seq, first.seq + 1);
});

describe('retention limits', () => {
  let jsm: JetStreamManager;
  before(async () => {
    jsm = await jetstreamManager(nc);
  });

  test('discard new rejects a publication over max_msgs', async () => {
    await recreateStream(jsm, { name: 'SPIKE_LIMITS', subjects: ['spike.limits.*'], max_msgs: 2, discard: DiscardPolicy.New });
    await js.publish('spike.limits.x', '1');
    await js.publish('spike.limits.x', '2');
    await assert.rejects(js.publish('spike.limits.x', '3'), /maximum messages exceeded/);
  });

  test('discard new rejects a publication over max_bytes', async () => {
    await recreateStream(jsm, { name: 'SPIKE_LIMITS', subjects: ['spike.limits.*'], max_bytes: 2048, discard: DiscardPolicy.New });
    await js.publish('spike.limits.x', new Uint8Array(1500));
    await assert.rejects(js.publish('spike.limits.x', new Uint8Array(1500)), /maximum bytes exceeded/);
  });

  test('a per-subject limit bounds one worker backlog without blocking another', async () => {
    await recreateStream(jsm, {
      name: 'SPIKE_LIMITS',
      subjects: ['spike.limits.*'],
      max_msgs_per_subject: 2,
      discard: DiscardPolicy.New,
      discard_new_per_subject: true,
    });
    await js.publish('spike.limits.worker-a', '1');
    await js.publish('spike.limits.worker-a', '2');

    await assert.rejects(js.publish('spike.limits.worker-a', '3'), /maximum messages per subject exceeded/);
    assert.equal((await js.publish('spike.limits.worker-b', '1')).duplicate, false);
  });

  test('discard old drops the oldest message over max_msgs', async () => {
    await recreateStream(jsm, { name: 'SPIKE_LIMITS', subjects: ['spike.limits.*'], max_msgs: 2 });
    for (const body of ['1', '2', '3']) await js.publish('spike.limits.x', body);

    const kept = (await jsm.streams.info('SPIKE_LIMITS')).state;

    assert.deepEqual([kept.messages, kept.first_seq, kept.last_seq], [2, 2, 3]);
  });

  test('max_age expires stored messages', async (t) => {
    await recreateStream(jsm, { name: 'SPIKE_LIMITS', subjects: ['spike.limits.*'], max_age: SECOND_NS });
    const publishedAt = performance.now();
    await js.publish('spike.limits.x', '1');

    await waitFor(async () => (await jsm.streams.info('SPIKE_LIMITS')).state.messages === 0, 5000);

    const interval = millisecondsSince(publishedAt);
    t.diagnostic(`expired ${interval} ms after publication (max_age 1000 ms)`);
    assert.ok(interval >= 900);
  });
});

describe('poison-message quarantine', () => {
  const MAX_DELIVER = 3;
  let jsm: JetStreamManager;
  let uncapturedSeq: number;

  before(async () => {
    jsm = await recreateCommandTopology(nc, { duplicate_window: 60 * SECOND_NS }, { max_deliver: MAX_DELIVER, ack_wait: 30 * SECOND_NS });
    await recreateStream(jsm, { name: QUARANTINE_STREAM, subjects: ['spike.quarantine.*'] });
    uncapturedSeq = await terminateBeforeCapture();
    await recreateStream(jsm, {
      name: ADVISORY_STREAM,
      subjects: [
        `$JS.EVENT.ADVISORY.CONSUMER.MAX_DELIVERIES.${COMMAND_STREAM}.*`,
        `$JS.EVENT.ADVISORY.CONSUMER.MSG_TERMINATED.${COMMAND_STREAM}.*`,
      ],
    });
  });

  async function terminateBeforeCapture(): Promise<number> {
    const published = await js.publish(commandSubject('worker-a'), 'uncaptured');
    const message = await (await js.consumers.get(COMMAND_STREAM, 'worker-a')).next({ expires: 1000 });
    message?.term('before-capture');
    await nc.flush();
    return published.seq;
  }

  async function rejectEveryDelivery(): Promise<void> {
    const consumer = await js.consumers.get(COMMAND_STREAM, 'worker-a');
    for (let attempt = 0; attempt <= MAX_DELIVER; attempt++) {
      for await (const message of await consumer.fetch({ max_messages: 10, expires: 1000 })) {
        if (message.string() === 'malformed') message.term('schema-invalid');
        else message.nak();
      }
    }
  }

  interface Advisory {
    readonly type: string;
    readonly stream_seq: number;
    readonly deliveries: number;
    readonly reason?: string;
  }

  async function advisories(): Promise<Advisory[]> {
    const { first_seq, last_seq, messages } = (await jsm.streams.info(ADVISORY_STREAM)).state;
    if (messages === 0) return [];
    const stored: Advisory[] = [];
    for (let seq = first_seq; seq <= last_seq; seq++) {
      const message = await jsm.streams.getMessage(ADVISORY_STREAM, { seq });
      if (message) stored.push(message.json<Advisory>());
    }
    return stored;
  }

  // Copies the original command with its diagnostics into the quarantine.
  async function quarantine(advisory: Advisory): Promise<void> {
    const original = await jsm.streams.getMessage(COMMAND_STREAM, { seq: advisory.stream_seq });
    assert.ok(original);
    const diagnostics = headers();
    diagnostics.set('Spike-Original-Stream-Seq', String(original.seq));
    diagnostics.set('Spike-Original-Msg-Id', original.header.get('Nats-Msg-Id'));
    diagnostics.set('Spike-Reason', advisory.type);
    await js.publish('spike.quarantine.worker-a', original.data, { headers: diagnostics });
  }

  test('a stream records only the advisories published after it exists', async () => {
    const malformed = await js.publish(commandSubject('worker-a'), 'malformed', { msgID: 'command-malformed' });
    const failing = await js.publish(commandSubject('worker-a'), 'failing', { msgID: 'command-failing' });

    await rejectEveryDelivery();
    await waitFor(async () => (await advisories()).length >= 2, 2000);

    const recorded = (await advisories()).map((a) => [a.type.split('.').pop(), a.stream_seq, a.deliveries, a.reason]);
    assert.deepEqual(recorded, [
      ['terminated', malformed.seq, 1, 'schema-invalid'],
      ['max_deliver', failing.seq, MAX_DELIVER, undefined],
    ]);
    assert.ok(!(await advisories()).some((a) => a.stream_seq === uncapturedSeq));
    const consumer = await jsm.consumers.info(COMMAND_STREAM, 'worker-a');
    assert.deepEqual([consumer.num_pending, consumer.num_ack_pending], [0, 0]);
    assert.equal((await jsm.streams.info(COMMAND_STREAM)).state.messages, 3);
  });

  test('a quarantined command is redriven from its record only under a new message ID', async () => {
    const maxDeliver = (await advisories()).find((a) => a.type.endsWith('max_deliver'));
    assert.ok(maxDeliver);
    await quarantine(maxDeliver);

    const record = await jsm.streams.getMessage(QUARANTINE_STREAM, { last_by_subj: 'spike.quarantine.worker-a' });
    assert.ok(record);
    const originalMsgId = record.header.get('Spike-Original-Msg-Id');
    assert.deepEqual([record.string(), originalMsgId, record.header.get('Spike-Original-Stream-Seq')], ['failing', 'command-failing', String(maxDeliver.stream_seq)]);
    const sameId = await js.publish(commandSubject('worker-a'), record.data, { msgID: originalMsgId });
    const newId = await js.publish(commandSubject('worker-a'), record.data, { msgID: `${originalMsgId}.redrive-1` });
    const [redriven] = await fetchDeliveries(COMMAND_STREAM, 'worker-a', 1, 1000);

    assert.equal(sameId.duplicate, true);
    assert.equal(newId.duplicate, false);
    assert.deepEqual([redriven?.body, redriven?.deliveryCount], ['failing', 1]);
  });
});

describe('per-worker subject permissions', () => {
  let workerA: NatsConnection;
  let serverErrors: string[];

  before(async () => {
    await recreateCommandTopology(nc);
    await recreateStream(await jetstreamManager(nc), { name: OBSERVATION_STREAM, subjects: ['spike.obs.*'] });
    await js.publish(commandSubject('worker-a'), 'for-a');
    await js.publish(commandSubject('worker-b'), 'for-b');
    workerA = await connectAsWorker('worker-a');
    serverErrors = collectServerErrors(workerA);
  });

  after(async () => {
    await workerA.close();
  });

  test('worker A pulls and acknowledges its own commands', async () => {
    const message = await (await jetstream(workerA).consumers.get(COMMAND_STREAM, 'worker-a')).next({ expires: 1000 });
    assert.equal(message?.string(), 'for-a');
    assert.equal(await message?.ackAck(), true);
  });

  test('worker A cannot look up or pull the consumer of worker B', async () => {
    await assert.rejects(jetstream(workerA).consumers.get(COMMAND_STREAM, 'worker-b'), /Permissions Violation/);
    const jsm = await jetstreamManager(nc);
    const consumerOfB = jetstream(workerA).consumers.getConsumerFromInfo(await jsm.consumers.info(COMMAND_STREAM, 'worker-b'));

    await assert.rejects(consumerOfB.next({ expires: 1000 }), /heartbeats missed/);
    assert.ok(serverErrors.some((e) => e.includes(`$JS.API.CONSUMER.MSG.NEXT.${COMMAND_STREAM}.worker-b`)));
    assert.equal((await jsm.consumers.info(COMMAND_STREAM, 'worker-b')).num_pending, 1);
  });

  test('worker A cannot subscribe to B commands or B inbox', async () => {
    workerA.subscribe(commandSubject('worker-b'));
    workerA.subscribe('_INBOX.worker-b.>');
    await workerA.flush();
    await delay(100);

    assert.ok(serverErrors.some((e) => e.includes(`Subscription to "${commandSubject('worker-b')}"`)));
    assert.ok(serverErrors.some((e) => e.includes('Subscription to "_INBOX.worker-b.>"')));
  });

  test('worker A publishes observations as itself, never as B', async () => {
    const own = await jetstream(workerA).publish(observationSubject('worker-a'), 'fact');
    await assert.rejects(jetstream(workerA).publish(observationSubject('worker-b'), 'forged'), /Permissions Violation/);

    assert.equal(own.stream, OBSERVATION_STREAM);
    const subjects = await (await jetstreamManager(nc)).streams.info(OBSERVATION_STREAM, { subjects_filter: '>' });
    assert.deepEqual(subjects.state.subjects, { [observationSubject('worker-a')]: 1 });
  });

  test('worker A cannot create a consumer on B commands', async () => {
    const request = workerA.request(
      `$JS.API.CONSUMER.CREATE.${COMMAND_STREAM}.stolen.${commandSubject('worker-b')}`,
      JSON.stringify({ stream_name: COMMAND_STREAM, config: { name: 'stolen', filter_subject: commandSubject('worker-b') } }),
      { timeout: 1000 },
    );
    await assert.rejects(request, /Permissions Violation/);
  });

  test('without its own inbox prefix a publication lands but the client sees a failure', async () => {
    const plain = await connectAsWorker('worker-a', '_INBOX');
    try {
      await assert.rejects(jetstream(plain).publish(observationSubject('worker-a'), 'unconfirmed'), /Permissions Violation for Subscription/);
      await delay(100);
      const state = (await (await jetstreamManager(nc)).streams.info(OBSERVATION_STREAM)).state;
      assert.equal(state.messages, 2);
    } finally {
      await plain.close();
    }
  });
});

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { InMemoryInbox } from '@taskelith/execution';
import { err, failure, ok, parseInstant } from '@taskelith/kernel';
import { InMemoryLogSink, InMemoryMetrics, Logger } from '@taskelith/observability';
import { SimulatedHost, value } from '@taskelith/testing';
import {
  applyOnce,
  encodeJson,
  ensureObservationConsumer,
  ensureStreams,
  ensureWorkerConsumer,
  HeartbeatReceiver,
  JetStreamPublisher,
  MAX_DELIVERIES_REASON,
  observationConsumer,
  OutboxPublisher,
  Quarantine,
  runOutboxPublisher,
  workerCommandConsumer,
  TRANSPORT_LIMITS,
  type QuarantineRecord,
  type ReceivedHeartbeat,
} from '@taskelith/nats';
import { FakeOutbox, outboxRow } from './fakes.ts';
import { capacityDeclared, confirmation, heartbeat, inventoryPart, offer } from './messages.ts';
import {
  expectOk,
  installation,
  observationReader,
  recordingHandler,
  running,
  TEST_LIMITS,
  waitFor,
} from './nats-fixtures.ts';

const failed = err(failure('unavailable', 'commit failed'));

async function quarantined(quarantine: Quarantine, count: number): Promise<readonly QuarantineRecord[]> {
  await waitFor(async () => {
    expectOk(await quarantine.capture());
    return expectOk(await quarantine.records()).length >= count;
  });
  return expectOk(await quarantine.records());
}

describe('topology', () => {
  test('creating the streams again updates them in place', async () => {
    const { address, transport } = await installation(['worker-1']);
    expectOk(await ensureStreams(transport.jsm, address, TEST_LIMITS));
    const commands = await transport.jsm.streams.info(address.streamName('commands'));
    assert.deepEqual(
      [commands.config.max_msgs_per_subject, commands.config.discard_new_per_subject, commands.config.max_msg_size],
      [10_000, true, 1024 ** 2],
    );
    expectOk(await ensureWorkerConsumer(transport.jsm, address, 'worker-1', { ...TEST_LIMITS, maxDeliver: 4 }));
    await observationReader(transport, address, 'execution');
    expectOk(await ensureObservationConsumer(transport.jsm, address, 'execution', { ...TEST_LIMITS, maxDeliver: 2 }));
    const consumer = await transport.jsm.consumers.info(address.streamName('commands'), 'worker-1');
    assert.deepEqual(
      [consumer.config.filter_subject, consumer.config.max_deliver, consumer.config.max_ack_pending],
      [expectOk(address.commandSubject('worker-1')), 4, 4],
    );
    const reader = await transport.jsm.consumers.info(address.streamName('observations'), 'execution');
    assert.deepEqual([reader.config.filter_subject, reader.config.max_deliver], [address.allWorkerSubjects('observations'), 2]);
  });
});

describe('outbox publication', () => {
  test('outbox rows reach only the addressed worker, and a repeat after a lost mark is a broker duplicate', async () => {
    const { address, transport } = await installation(['worker-1', 'worker-2']);
    const outbox = new FakeOutbox([
      outboxRow('command-1', 'workers.worker-1.commands', offer('command-1')),
      outboxRow('command-2', 'workers.worker-2.commands', offer('command-2', 'worker-2')),
    ]);
    outbox.failMarkFor.add('command-1');
    let clock = 0;
    const publisher = new OutboxPublisher(outbox, new JetStreamPublisher(transport.js), address, { now: () => clock });

    assert.deepEqual(await publisher.publishPending(), ok({ published: 1, deferred: 1 }));
    outbox.failMarkFor.clear();
    clock += TEST_LIMITS.retryMaxMilliseconds + TRANSPORT_LIMITS.retryMaxMilliseconds;
    assert.deepEqual(await publisher.publishPending(), ok({ published: 1, deferred: 0 }));

    const first = recordingHandler();
    const second = recordingHandler();
    running((signal) => workerCommandConsumer(transport.js, address, 'worker-1', first.handle, { limits: TEST_LIMITS }).run(signal));
    running((signal) => workerCommandConsumer(transport.js, address, 'worker-2', second.handle, { limits: TEST_LIMITS }).run(signal));
    await waitFor(() => first.deliveries.length === 1 && second.deliveries.length === 1);
    assert.deepEqual(first.deliveries.map((d) => [d.identity, d.subject]), [['command-1', expectOk(address.commandSubject('worker-1'))]]);
    assert.deepEqual(second.deliveries.map((d) => d.identity), ['command-2']);
    assert.equal((await transport.jsm.streams.info(address.streamName('commands'))).state.messages, 2);
  });

  test('the publisher loop drains the outbox and stops when aborted', async () => {
    const { address, transport } = await installation(['worker-1']);
    const outbox = new FakeOutbox(['a', 'b', 'c'].map((id) => outboxRow(`command-${id}`, 'workers.worker-1.commands', offer(`command-${id}`))));
    const publisher = new OutboxPublisher(outbox, new JetStreamPublisher(transport.js), address);
    const controller = running((signal) => runOutboxPublisher(publisher, signal, TEST_LIMITS));

    await waitFor(() => outbox.published.length === 3);
    outbox.unavailable = true;
    await new Promise((resolve) => setTimeout(resolve, 200));
    controller.abort();
    assert.deepEqual(outbox.published, ['command-a', 'command-b', 'command-c']);
  });
});

describe('worker command consumer', () => {
  test('acks after the commit, redelivers after a failed one, and quarantines a malformed message', async () => {
    const { address, transport } = await installation(['worker-1']);
    const publisher = new JetStreamPublisher(transport.js);
    const subject = expectOk(address.commandSubject('worker-1'));
    expectOk(await publisher.publish({ subject, body: encodeJson(offer('command-1')), messageId: 'command-1' }));
    expectOk(await publisher.publish({ subject, body: new TextEncoder().encode('{'), messageId: 'command-bad' }));
    expectOk(await publisher.publish({ subject, body: encodeJson(confirmation()) }));
    const handler = recordingHandler([failed]);
    running((signal) => workerCommandConsumer(transport.js, address, 'worker-1', handler.handle, { limits: TEST_LIMITS }).run(signal));

    await waitFor(() => handler.deliveries.length === 3);
    const seen = handler.deliveries.map((d) => `${d.identity ?? d.type}@${d.deliveryCount}`);
    // The redelivery of the failed commit may precede or follow the notice.
    assert.deepEqual([seen[0], [...seen.slice(1)].sort()], [
      'command-1@1',
      ['command-1@2', 'execution.observations.confirmed@1'],
    ]);
    const [record] = await quarantined(new Quarantine(transport.jsm, transport.js, address, TEST_LIMITS), 1);
    assert.deepEqual(
      [record?.source, record?.reason, record?.originalMessageId, record?.consumer, record?.originalSubject],
      ['commands', 'not UTF-8 JSON', 'command-bad', 'worker-1', subject],
    );
    await waitFor(async () => (await transport.jsm.consumers.info(address.streamName('commands'), 'worker-1')).num_ack_pending === 0);
  });

  test('a message every commit fails is quarantined after max_deliver and redriven under a new message ID', async () => {
    const { address, transport } = await installation(['worker-1']);
    const subject = expectOk(address.commandSubject('worker-1'));
    expectOk(await new JetStreamPublisher(transport.js).publish({ subject, body: encodeJson(offer('command-1')), messageId: 'command-1' }));
    const handler = recordingHandler([failed, failed, failed]);
    running((signal) => workerCommandConsumer(transport.js, address, 'worker-1', handler.handle, { limits: TEST_LIMITS }).run(signal));
    const quarantine = new Quarantine(transport.jsm, transport.js, address, TEST_LIMITS);

    const [record] = await quarantined(quarantine, 1);
    assert.deepEqual(
      [record?.reason, record?.deliveries, record?.originalMessageId],
      [MAX_DELIVERIES_REASON, TEST_LIMITS.maxDeliver, 'command-1'],
    );
    assert.deepEqual(await quarantine.redrive(record!.sequence), ok('command-1.redrive.1'));
    await waitFor(() => handler.deliveries.length === 4);
    assert.deepEqual([handler.deliveries[3]?.identity, handler.deliveries[3]?.deliveryCount], ['command-1', 1]);
    assert.deepEqual(expectOk(await quarantine.records()), []);
    assert.deepEqual(expectOk(await quarantine.records(record!.sequence + 1, 1)), []);
    assert.equal((await quarantine.redrive(record!.sequence)).ok, false);
  });

  test('the receiver applies a message once by its body identity, also after the broker window', async () => {
    const { address, transport } = await installation(['worker-1']);
    const subject = expectOk(address.commandSubject('worker-1'));
    const publisher = new JetStreamPublisher(transport.js);
    const body = encodeJson(offer('command-1'));
    // The second identity stands for a repeat the broker no longer remembers.
    assert.deepEqual(await publisher.publish({ subject, body, messageId: 'command-1' }), ok('stored'));
    assert.deepEqual(await publisher.publish({ subject, body, messageId: 'command-1' }), ok('duplicate'));
    assert.deepEqual(await publisher.publish({ subject, body, messageId: 'command-1.redrive.1' }), ok('stored'));
    const inbox = new InMemoryInbox();
    const outcomes: string[] = [];
    running((signal) =>
      workerCommandConsumer(transport.js, address, 'worker-1', async (message) => {
        const applied = await applyOnce(inbox, 'worker-1', message, async () => ok(undefined));
        if (applied.ok) outcomes.push(applied.value);
        return applied;
      }, { limits: TEST_LIMITS }).run(signal));

    await waitFor(() => outcomes.length === 2);
    assert.deepEqual(outcomes, ['accepted', 'duplicate']);
  });

  test('a commit longer than ack_wait redelivers neither its message nor the next one', async () => {
    const { address, transport } = await installation(['worker-1']);
    const subject = expectOk(address.commandSubject('worker-1'));
    const publisher = new JetStreamPublisher(transport.js);
    for (const id of ['command-1', 'command-2']) expectOk(await publisher.publish({ subject, body: encodeJson(offer(id)), messageId: id }));
    const deliveries: Array<[string | undefined, number]> = [];
    running((signal) =>
      workerCommandConsumer(transport.js, address, 'worker-1', async (message) => {
        deliveries.push([message.identity, message.deliveryCount]);
        if (message.identity === 'command-1') await new Promise((resolve) => setTimeout(resolve, 2 * TEST_LIMITS.ackWaitMilliseconds));
        return ok(undefined);
      }, { limits: TEST_LIMITS }).run(signal));

    await waitFor(async () => {
      const info = await transport.jsm.consumers.info(address.streamName('commands'), 'worker-1');
      return info.ack_floor.stream_seq === 2;
    });
    await new Promise((resolve) => setTimeout(resolve, TEST_LIMITS.ackWaitMilliseconds));
    assert.deepEqual(deliveries, [['command-1', 1], ['command-2', 1]]);
  });

  test('a handler that throws is redelivered like a failed commit', async () => {
    const { address, transport } = await installation(['worker-1']);
    const subject = expectOk(address.commandSubject('worker-1'));
    expectOk(await new JetStreamPublisher(transport.js).publish({ subject, body: encodeJson(offer('command-1')), messageId: 'command-1' }));
    const deliveries: number[] = [];
    running((signal) =>
      workerCommandConsumer(transport.js, address, 'worker-1', async (message) => {
        deliveries.push(message.deliveryCount);
        if (message.deliveryCount === 1) throw new Error('handler bug');
        return ok(undefined);
      }, { limits: TEST_LIMITS }).run(signal));

    await waitFor(() => deliveries.length === 2);
    assert.deepEqual(deliveries, [1, 2]);
  });
});

describe('consumer observability', () => {
  function observed() {
    const sink = new InMemoryLogSink();
    const metrics = new InMemoryMetrics();
    const logger = new Logger(sink, new SimulatedHost(value(parseInstant('2026-10-25T10:00:00.000Z'))).wallClock);
    return { sink, metrics, options: { limits: TEST_LIMITS, logger, metrics } };
  }

  test('a commit records the inbox lag, and a failure and a quarantine are logged with correlation', async () => {
    const { address, transport } = await installation(['worker-1']);
    const subject = expectOk(address.commandSubject('worker-1'));
    const publisher = new JetStreamPublisher(transport.js);
    expectOk(await publisher.publish({ subject, body: encodeJson(offer('command-1')), messageId: 'command-1' }));
    expectOk(await publisher.publish({ subject, body: new TextEncoder().encode('{'), messageId: 'command-bad' }));
    const { sink, metrics, options } = observed();
    const handler = recordingHandler([err(failure('unavailable', 'commit failed at postgres://u:secret@db'))]);
    running((signal) => workerCommandConsumer(transport.js, address, 'worker-1', handler.handle, options).run(signal));

    await waitFor(() => handler.deliveries.length === 2 && sink.records.length === 2);
    const labels = { stream: address.streamName('commands'), consumer: 'worker-1' };
    await waitFor(() => metrics.series('inbox.lag', labels)?.count === 1);
    const lag = metrics.series('inbox.lag', labels)!;
    assert.ok(lag.last >= 0 && lag.last < 30, String(lag.last));
    const events = Object.fromEntries(sink.records.map((record) => [record.event, record]));
    assert.deepEqual(events['nats.message.quarantined']?.fields, { subject, reason: 'not UTF-8 JSON' });
    const redelivered = events['nats.message.redelivered']!;
    assert.deepEqual(redelivered.correlation, { correlationId: 'correlation-1', commandId: 'command-1', attemptId: 'attempt-1', taskId: 'task-1', workerId: 'worker-1' });
    assert.deepEqual({ ...redelivered.fields, delayMilliseconds: 0 }, {
      subject, type: 'execution.assignment.offer', deliveryCount: 1, delayMilliseconds: 0, code: 'unavailable', message: 'commit failed at postgres://[redacted]@db',
    });
  });

  test('a pull that fails is logged with its stream and consumer', async () => {
    const { address, transport } = await installation(['worker-1']);
    const { sink, options } = observed();
    running((signal) => workerCommandConsumer(transport.js, address, 'worker-9', recordingHandler().handle, options).run(signal));

    await waitFor(() => sink.records.length > 0);
    assert.equal(sink.records[0]?.event, 'nats.pull.failed');
    assert.deepEqual({ ...sink.records[0]?.fields, cause: '' }, { stream: address.streamName('commands'), consumer: 'worker-9', failedPulls: 1, cause: '' });
  });
});

describe('quarantine keeper', () => {
  test('an original that expired before the capture is recorded without a body and cannot be redriven', async () => {
    const { address, transport } = await installation(['worker-1']);
    const subject = expectOk(address.commandSubject('worker-1'));
    const stored = await transport.js.publish(subject, encodeJson({ junk: true }), { msgID: 'command-bad' });
    running((signal) => workerCommandConsumer(transport.js, address, 'worker-1', recordingHandler().handle, { limits: TEST_LIMITS }).run(signal));
    await waitFor(async () => (await transport.jsm.streams.info(address.streamName('advisories'))).state.messages === 1);
    await transport.jsm.streams.deleteMessage(address.streamName('commands'), stored.seq);
    const quarantine = new Quarantine(transport.jsm, transport.js, address, TEST_LIMITS);

    const [record] = await quarantined(quarantine, 1);
    assert.deepEqual([record?.body, record?.originalStreamSequence], [null, stored.seq]);
    const redriven = await quarantine.redrive(record!.sequence);
    assert.equal(!redriven.ok && redriven.error.code, 'precondition-failed');
  });

  test('an advisory that cannot be captured is terminated and does not hold back the others', async () => {
    const { address, transport } = await installation(['worker-1']);
    const advisorySubject = `$JS.EVENT.ADVISORY.CONSUMER.MSG_TERMINATED.${address.streamName('commands')}.worker-1`;
    transport.connection.publish(advisorySubject, '{');
    transport.connection.publish(advisorySubject, JSON.stringify({ stream: 'OTHER', stream_seq: 1 }));
    transport.connection.publish(advisorySubject, JSON.stringify({ stream: address.streamName('commands'), stream_seq: 1 }));
    await transport.connection.flush();
    const subject = expectOk(address.commandSubject('worker-1'));
    expectOk(await new JetStreamPublisher(transport.js).publish({ subject, body: encodeJson({ junk: true }), messageId: 'command-bad' }));
    running((signal) => workerCommandConsumer(transport.js, address, 'worker-1', recordingHandler().handle, { limits: TEST_LIMITS }).run(signal));

    const records = await quarantined(new Quarantine(transport.jsm, transport.js, address, TEST_LIMITS), 1);
    assert.deepEqual(records.map((r) => r.originalMessageId), ['command-bad']);
    await waitFor(async () => {
      const info = await transport.jsm.consumers.info(address.streamName('advisories'), 'quarantine');
      return info.num_pending === 0 && info.num_ack_pending === 0;
    });
  });
});

describe('observation consumers', () => {
  test('independent consumers each read every worker observation and quarantine a malformed one', async () => {
    const { address, transport } = await installation([]);
    await observationReader(transport, address, 'execution');
    await observationReader(transport, address, 'learning');
    const publisher = new JetStreamPublisher(transport.js);
    for (const [worker, body, messageId] of [
      ['worker-1', capacityDeclared('observation-1'), 'observation-1'],
      ['worker-2', inventoryPart('report-1', 1, 'worker-2'), 'report-1.1'],
      ['worker-2', { metadata: { observationType: 'execution.started' } }, 'observation-bad'],
    ] as const) {
      expectOk(await publisher.publish({ subject: expectOk(address.observationSubject(worker)), body: encodeJson(body), messageId }));
    }
    const execution = recordingHandler();
    const learning = recordingHandler();
    running((signal) => observationConsumer(transport.js, address, 'execution', execution.handle, { limits: TEST_LIMITS }).run(signal));
    running((signal) => observationConsumer(transport.js, address, 'learning', learning.handle, { limits: TEST_LIMITS }).run(signal));

    await waitFor(() => execution.deliveries.length === 2 && learning.deliveries.length === 2);
    assert.deepEqual(execution.deliveries.map((d) => d.identity), ['observation-1', 'report-1.1']);
    assert.deepEqual(learning.deliveries.map((d) => d.identity), ['observation-1', 'report-1.1']);
    const records = await quarantined(new Quarantine(transport.jsm, transport.js, address, TEST_LIMITS), 2);
    assert.deepEqual(records.map((r) => [r.source, r.consumer, r.originalMessageId]).sort(), [
      ['observations', 'execution', 'observation-bad'],
      ['observations', 'learning', 'observation-bad'],
    ]);
    assert.match(records[0]!.reason, /^violates ExecutionStartedObservation: /);
    const quarantine = new Quarantine(transport.jsm, transport.js, address, TEST_LIMITS);
    const [first] = expectOk(await quarantine.records(1, 1));
    const rest = expectOk(await quarantine.records(first!.sequence + 1));
    assert.deepEqual([first, ...rest].map((r) => r.sequence), records.map((r) => r.sequence));
  });
});

describe('heartbeat receiver', () => {
  test('receivers in one queue group share every worker heartbeat, which no stream keeps', async () => {
    const { address, transport } = await installation([]);
    const received: ReceivedHeartbeat[][] = [[], []];
    for (const heartbeats of received) {
      const receiver = new HeartbeatReceiver({ connection: transport.connection, address, queue: 'control-plane' }, async (heartbeat) => {
        heartbeats.push(heartbeat);
        return ok(undefined);
      });
      running((signal) => receiver.run(signal));
    }
    await transport.connection.flush();
    const workers = ['worker-1', 'worker-2', 'worker-3', 'worker-4'];
    for (const worker of workers) transport.connection.publish(expectOk(address.heartbeatSubject(worker)), encodeJson(heartbeat(worker)));

    await waitFor(() => received.flat().length === workers.length);
    assert.deepEqual(received.flat().map((h) => h.body['workerId']).sort(), workers);
    await assert.rejects(transport.jsm.streams.find(expectOk(address.heartbeatSubject('worker-1'))), /no stream matches subject/);
  });

  test('a stop ends the receiver', async () => {
    const { address, transport } = await installation([]);
    const controller = new AbortController();
    const run = new HeartbeatReceiver({ connection: transport.connection, address, queue: 'control-plane' }, async () => ok(undefined)).run(controller.signal);
    controller.abort();
    await run;
  });
});

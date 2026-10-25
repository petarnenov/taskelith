import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { InMemoryInbox } from '@taskelith/execution';
import { err, failure, ok } from '@taskelith/kernel';
import {
  applyOnce,
  encodeJson,
  ensureStreams,
  JetStreamPublisher,
  MAX_DELIVERIES_REASON,
  observationConsumer,
  OutboxPublisher,
  Quarantine,
  runOutboxPublisher,
  workerCommandConsumer,
  type QuarantineRecord,
} from '@taskelith/nats';
import { FakeOutbox, outboxRow } from './fakes.ts';
import { capacityDeclared, confirmation, inventoryPart, offer } from './messages.ts';
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
    const consumer = await transport.jsm.consumers.info(address.streamName('commands'), 'worker-1');
    assert.deepEqual(
      [consumer.config.filter_subject, consumer.config.max_deliver, consumer.config.max_ack_pending],
      [expectOk(address.commandSubject('worker-1')), 3, 4],
    );
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
    const publisher = new OutboxPublisher(outbox, new JetStreamPublisher(transport.js), address);

    assert.deepEqual(await publisher.publishPending(), ok({ published: 1, deferred: 1 }));
    outbox.failMarkFor.clear();
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
    assert.deepEqual(handler.deliveries.map((d) => [d.identity ?? d.type, d.deliveryCount]), [
      ['command-1', 1],
      ['execution.observations.confirmed', 1],
      ['command-1', 2],
    ]);
    const [record] = await quarantined(new Quarantine(transport.jsm, transport.js, address), 1);
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
    const quarantine = new Quarantine(transport.jsm, transport.js, address);

    const [record] = await quarantined(quarantine, 1);
    assert.deepEqual(
      [record?.reason, record?.deliveries, record?.originalMessageId],
      [MAX_DELIVERIES_REASON, TEST_LIMITS.maxDeliver, 'command-1'],
    );
    assert.deepEqual(await quarantine.redrive(record!.sequence), ok('command-1.redrive.1'));
    await waitFor(() => handler.deliveries.length === 4);
    assert.deepEqual([handler.deliveries[3]?.identity, handler.deliveries[3]?.deliveryCount], ['command-1', 1]);
    assert.deepEqual(expectOk(await quarantine.records()), []);
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

  test('a commit longer than ack_wait is not redelivered meanwhile', async () => {
    const { address, transport } = await installation(['worker-1']);
    const subject = expectOk(address.commandSubject('worker-1'));
    expectOk(await new JetStreamPublisher(transport.js).publish({ subject, body: encodeJson(offer('command-1')), messageId: 'command-1' }));
    const deliveries: number[] = [];
    running((signal) =>
      workerCommandConsumer(transport.js, address, 'worker-1', async (message) => {
        deliveries.push(message.deliveryCount);
        await new Promise((resolve) => setTimeout(resolve, 2 * TEST_LIMITS.ackWaitMilliseconds));
        return ok(undefined);
      }, { limits: TEST_LIMITS }).run(signal));

    await waitFor(async () => {
      const info = await transport.jsm.consumers.info(address.streamName('commands'), 'worker-1');
      return deliveries.length === 1 && info.ack_floor.stream_seq === 1;
    });
    assert.deepEqual(deliveries, [1]);
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
    const records = await quarantined(new Quarantine(transport.jsm, transport.js, address), 2);
    assert.deepEqual(records.map((r) => [r.source, r.consumer, r.originalMessageId]).sort(), [
      ['observations', 'execution', 'observation-bad'],
      ['observations', 'learning', 'observation-bad'],
    ]);
    assert.match(records[0]!.reason, /^violates ExecutionStartedObservation: /);
  });
});

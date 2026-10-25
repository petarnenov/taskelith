import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JetStreamApiCodes, JetStreamApiError, type JetStreamClient, type JetStreamManager } from '@nats-io/jetstream';
import type { NatsConnection } from '@nats-io/nats-core';
import { InMemoryInbox, type WorkerId } from '@taskelith/execution';
import { err, failure, ok, parseInstant, type Result } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { SimulatedHost, value } from '@taskelith/testing';
import {
  applyOnce,
  COMMAND_SCHEMAS,
  COMMAND_SUBJECT_NOTICES,
  encodeJson,
  HeartbeatReceiver,
  INVENTORY_REPORTED,
  JetStreamPublisher,
  NatsCommandConsumers,
  OBSERVATION_SCHEMAS,
  OutboxPublisher,
  readCommandSubjectMessage,
  readHeartbeatSubjectMessage,
  readObservationSubjectMessage,
  redriveMessageId,
  retryDelayMilliseconds,
  streamConfigs,
  TRANSPORT_LIMITS,
  TransportAddress,
  WORKER_HEARTBEAT,
} from '@taskelith/nats';
import { FakeOutbox, outboxRow } from './fakes.ts';
import { capacityDeclared, confirmation, heartbeat, inventoryPart, inventoryRequest, offer } from './messages.ts';

const ADDRESS = TransportAddress.of('install-1');
assert.ok(ADDRESS.ok);
const address = ADDRESS.value;

function bytes(value: unknown): Uint8Array {
  return encodeJson(value);
}

function rejection(result: Result<unknown, string>): string {
  assert.ok(!result.ok, 'expected the message to be rejected');
  return result.error;
}

test('subjects follow the execution contract and refuse tokens NATS would parse', () => {
  assert.deepEqual(address.commandSubject('worker-1'), ok('taskelith.install-1.workers.worker-1.commands'));
  assert.deepEqual(address.observationSubject('worker-1'), ok('taskelith.install-1.workers.worker-1.observations'));
  assert.deepEqual(address.subjectOfOutboxRow('workers.worker-1.commands'), ok('taskelith.install-1.workers.worker-1.commands'));
  assert.deepEqual(address.inboxPrefix('worker-1'), ok('_INBOX.install-1.worker-1'));
  assert.equal(address.streamName('commands'), 'TASKELITH_install-1_COMMANDS');
  for (const workerId of ['a.b', 'a*', '>', '', 'x'.repeat(65)]) {
    assert.equal(address.commandSubject(workerId).ok, false, workerId);
    assert.equal(address.inboxPrefix(workerId).ok, false, workerId);
  }
  assert.equal(TransportAddress.of('a.b').ok, false);
  assert.equal(address.subjectOfOutboxRow('workers.a.b.commands').ok, false);
  assert.equal(address.subjectOfOutboxRow('tasks.1.events').ok, false);
  assert.deepEqual(address.subjectOfOutboxRow('sdlc.events'), ok('taskelith.install-1.sdlc.events'));
  assert.equal(address.workerOfObservationSubject('taskelith.install-1.workers.worker-1.observations'), 'worker-1');
  assert.deepEqual(address.heartbeatSubject('worker-1'), ok('taskelith.install-1.workers.worker-1.heartbeats'));
  assert.equal(address.workerOfHeartbeatSubject('taskelith.install-1.workers.worker-1.heartbeats'), 'worker-1');
  assert.equal(address.workerOfHeartbeatSubject('taskelith.install-1.workers.worker-1.observations'), undefined);
  assert.equal(address.workerOfObservationSubject('taskelith.install-1.workers.worker-1.heartbeats'), undefined);
  assert.equal(address.heartbeatSubject('a.b').ok, false);
  assert.ok(value(address.workerPermissions('worker-1')).publish.includes('taskelith.install-1.workers.worker-1.heartbeats'));
  for (const subject of [
    'taskelith.install-1.workers.worker-1.commands', 'taskelith.other.workers.worker-1.observations',
    'taskelith.install-1.workers.a.b.observations', 'taskelith.install-1.workers..observations',
  ]) assert.equal(address.workerOfObservationSubject(subject), undefined, subject);
});

test('streams carry the provisional bounds of the operational targets', () => {
  const [commands, observations, sdlc, quarantine, advisories] = streamConfigs(address);
  assert.deepEqual(sdlc?.subjects, ['taskelith.install-1.sdlc.events']);
  assert.deepEqual(commands?.subjects, ['taskelith.install-1.workers.*.commands']);
  assert.equal(commands?.max_msgs_per_subject, 10_000);
  assert.equal(commands?.discard_new_per_subject, true);
  assert.equal(commands?.max_age, 7 * 24 * 3600 * 1e9);
  assert.equal(observations?.max_bytes, 10 * 1024 ** 3);
  assert.equal(observations?.max_msg_size, 1024 ** 2);
  assert.equal(quarantine?.max_msg_size, -1);
  assert.equal(advisories?.subjects?.length, 4);
  assert.ok(advisories?.subjects?.includes('$JS.EVENT.ADVISORY.CONSUMER.MAX_DELIVERIES.TASKELITH_install-1_COMMANDS.*'));
});

test('retry delays double from the initial delay to the maximum, each up to a quarter shorter', () => {
  const noJitter = () => 0;
  assert.equal(retryDelayMilliseconds(1, TRANSPORT_LIMITS, noJitter), 5000);
  assert.equal(retryDelayMilliseconds(2, TRANSPORT_LIMITS, noJitter), 10_000);
  assert.equal(retryDelayMilliseconds(9, TRANSPORT_LIMITS, noJitter), 60_000);
  assert.equal(retryDelayMilliseconds(9, TRANSPORT_LIMITS, () => 1), 45_000);
  assert.equal(retryDelayMilliseconds(1, TRANSPORT_LIMITS, () => 1), 3750);
});

test('a redrive counts from the first message identity', () => {
  assert.equal(redriveMessageId('command-1'), 'command-1.redrive.1');
  assert.equal(redriveMessageId('command-1.redrive.1'), 'command-1.redrive.2');
  assert.equal(redriveMessageId('report-1.2'), 'report-1.2.redrive.1');
});

test('a command subject message passes only its schema, and its identity is the commandId', () => {
  const read = readCommandSubjectMessage(bytes(offer('command-1')));
  assert.ok(read.ok);
  assert.deepEqual([read.value.type, read.value.identity], ['execution.assignment.offer', 'command-1']);
  const notice = readCommandSubjectMessage(bytes(confirmation()));
  assert.ok(notice.ok);
  assert.equal(notice.value.identity, undefined);
  assert.equal(readCommandSubjectMessage(bytes(inventoryRequest())).ok, true);

  const invalid = { ...offer('command-2'), payload: { ...offer('command-2').payload, recoveryEpoch: 0 } };
  assert.match(rejection(readCommandSubjectMessage(bytes(invalid))), /^violates AssignmentOfferCommand: /);
  const unknownType = offer('command-3');
  unknownType.metadata.commandType = 'execution.unknown';
  assert.deepEqual(readCommandSubjectMessage(bytes(unknownType)), err('unknown command type execution.unknown'));
  assert.deepEqual(readCommandSubjectMessage(new TextEncoder().encode('{')), err('not UTF-8 JSON'));
  assert.deepEqual(readCommandSubjectMessage(Uint8Array.of(0xff)), err('not UTF-8 JSON'));
  assert.deepEqual(readCommandSubjectMessage(bytes([1])), err('not a JSON object'));
  assert.match(rejection(readCommandSubjectMessage(bytes({ metadata: {} }))), /^violates VersionedCommand: .* \(\+\d+\)$/);
  assert.match(rejection(readCommandSubjectMessage(bytes({ ...confirmation(), confirmedThrough: 0 }))), /^violates ObservationsConfirmed: /);
});

test('a command of an unsupported protocol version passes with its stable part for the worker to reject', () => {
  const future = { ...offer('command-9', 'worker-1', 2), payload: { protocolVersion: 2, unknown: true } };
  const read = readCommandSubjectMessage(bytes(future));
  assert.ok(read.ok);
  assert.deepEqual([read.value.type, read.value.identity], ['execution.assignment.offer', 'command-9']);
});

test('an observation subject message passes its schema; an inventory part is identified by report and part', () => {
  const observed = readObservationSubjectMessage(bytes(capacityDeclared('observation-1')));
  assert.ok(observed.ok);
  assert.equal(observed.value.identity, 'observation-1');
  const part = readObservationSubjectMessage(bytes(inventoryPart('report-1', 2)));
  assert.ok(part.ok);
  assert.deepEqual([part.value.type, part.value.identity], [INVENTORY_REPORTED, 'report-1.2']);
  assert.match(rejection(readObservationSubjectMessage(bytes({ ...inventoryPart('r', 1), part: 0 }))), /^violates InventoryReported: /);
  assert.deepEqual(readObservationSubjectMessage(bytes({ metadata: { observationType: 'x' } })), err('unknown observation type x'));
  assert.deepEqual(readObservationSubjectMessage(bytes({})), err('unknown observation type undefined'));
  assert.equal(rejection(readObservationSubjectMessage(bytes([]))), 'not a JSON object');
  const invalid = capacityDeclared('observation-2');
  invalid.metadata.sequence = 0;
  assert.match(rejection(readObservationSubjectMessage(bytes(invalid))), /^violates CapacityDeclaredObservation: /);
});

test('the schema tables cover every message of the execution channels', () => {
  const document = JSON.parse(readFileSync(new URL('../../../contracts/documents/execution.asyncapi.json', import.meta.url), 'utf8'));
  const schemaOf = (channel: string) =>
    Object.values<{ payload: { $ref: string } }>(document.components.messages)
      .filter((message) => Object.values<{ $ref: string }>(document.channels[channel].messages).some((ref) => document.components.messages[ref.$ref.split('/').pop()!] === message))
      .map((message) => message.payload.$ref.split('/').pop())
      .sort();
  assert.deepEqual(schemaOf('workerCommands'), [...Object.values(COMMAND_SCHEMAS), ...Object.values(COMMAND_SUBJECT_NOTICES)].sort());
  assert.deepEqual(schemaOf('workerObservations'), [...Object.values(OBSERVATION_SCHEMAS), 'InventoryReported'].sort());
  assert.deepEqual(schemaOf('workerHeartbeats'), ['WorkerHeartbeat']);
  assert.equal(document.channels.workerHeartbeats.address.replace('{installationId}', 'install-1').replace('{workerId}', 'worker-1'),
    value(address.heartbeatSubject('worker-1')));
});

test('a heartbeat subject message passes only the heartbeat schema and has no identity', () => {
  const read = readHeartbeatSubjectMessage(bytes(heartbeat('worker-1')));
  assert.ok(read.ok);
  assert.deepEqual([read.value.type, read.value.identity], [WORKER_HEARTBEAT, undefined]);
  assert.match(rejection(readHeartbeatSubjectMessage(bytes({ ...heartbeat('worker-1'), slots: 2 }))), /^violates WorkerHeartbeat: /);
  assert.equal(rejection(readHeartbeatSubjectMessage(new Uint8Array([0xff]))), 'not UTF-8 JSON');
});

test('a message is applied once per consumer by its body identity', async () => {
  const inbox = new InMemoryInbox();
  const applied: string[] = [];
  const apply = (name: string) => async (): Promise<Result<void>> => (applied.push(name), ok(undefined));
  const read = readCommandSubjectMessage(bytes(offer('command-1')));
  assert.ok(read.ok);

  assert.deepEqual(await applyOnce(inbox, 'worker-1', read.value, apply('first')), ok('accepted'));
  assert.deepEqual(await applyOnce(inbox, 'worker-1', read.value, apply('second')), ok('duplicate'));
  assert.deepEqual(await applyOnce(inbox, 'other', read.value, apply('other')), ok('accepted'));
  const notice = { type: 'execution.observations.confirmed', identity: undefined, body: {} };
  assert.deepEqual(await applyOnce(inbox, 'worker-1', notice, apply('notice')), ok('accepted'));
  assert.deepEqual(await applyOnce(inbox, 'worker-1', notice, apply('notice')), ok('accepted'));
  assert.deepEqual(applied, ['first', 'other', 'notice', 'notice']);

  const failing = async (): Promise<Result<void>> => err(failure('unavailable', 'down'));
  assert.equal((await applyOnce(inbox, 'worker-1', { ...notice, identity: 'command-2' }, failing)).ok, false);
  assert.equal((await applyOnce(inbox, 'worker-1', notice, failing)).ok, false);
  assert.equal((await applyOnce(inbox, 'worker-1', { ...notice, identity: 'bad id' }, failing)).ok, false);
});

function fakeBroker(rejected: Set<string>, sent: Array<[string, string | undefined]>): JetStreamClient {
  return {
    async publish(subject: string, _data: Uint8Array, options?: { msgID?: string }) {
      if (rejected.has(options?.msgID ?? '')) throw new Error('timeout');
      sent.push([subject, options?.msgID]);
      return { stream: 'S', seq: sent.length, duplicate: sent.filter(([, id]) => id === options?.msgID).length > 1 };
    },
  } as unknown as JetStreamClient;
}

test('the outbox publisher keeps the order of a subject and lets other subjects continue', async () => {
  const outbox = new FakeOutbox([
    outboxRow('e1', 'workers.w1.commands'),
    outboxRow('e2', 'workers.w1.commands'),
    outboxRow('e3', 'workers.w2.commands'),
    outboxRow('e4', 'workers.w1.commands'),
    outboxRow('e5', 'not.a.command'),
  ]);
  const rejected = new Set(['e2']);
  const sent: Array<[string, string | undefined]> = [];
  let clock = 0;
  const options = { now: () => clock };
  const publisher = new OutboxPublisher(outbox, new JetStreamPublisher(fakeBroker(rejected, sent)), address, options);

  assert.deepEqual(await publisher.publishPending(), ok({ published: 2, deferred: 3 }));
  assert.deepEqual(sent, [
    ['taskelith.install-1.workers.w1.commands', 'e1'],
    ['taskelith.install-1.workers.w2.commands', 'e3'],
  ]);

  rejected.clear();
  outbox.rows.push(outboxRow('e6', 'workers.w2.commands'));
  assert.deepEqual(await publisher.publishPending(), ok({ published: 1, deferred: 3 }), 'w1 backs off, w2 goes on');
  clock += TRANSPORT_LIMITS.retryInitialMilliseconds;
  outbox.failMarkFor.add('e4');
  assert.deepEqual(await publisher.publishPending(), ok({ published: 1, deferred: 2 }));
  outbox.failMarkFor.clear();
  clock += TRANSPORT_LIMITS.retryMaxMilliseconds;
  assert.deepEqual(await publisher.publishPending(), ok({ published: 1, deferred: 1 }));
  assert.deepEqual(outbox.published, ['e1', 'e3', 'e6', 'e2', 'e4']);
  assert.deepEqual(sent.map(([, id]) => id), ['e1', 'e3', 'e6', 'e2', 'e4', 'e4']);

  outbox.unavailable = true;
  assert.equal((await publisher.publishPending()).ok, false);
});

test('a confirmation is published without a message identity, a command with its own', async () => {
  const confirmation = { ...outboxRow('o1', 'workers.w1.commands'), metadata: { eventId: 'o1', eventType: 'execution.observations.confirmed' } };
  const outbox = new FakeOutbox([outboxRow('e1', 'workers.w1.commands'), confirmation as never]);
  const sent: Array<[string, string | undefined]> = [];
  const publisher = new OutboxPublisher(outbox, new JetStreamPublisher(fakeBroker(new Set(), sent)), address);
  assert.deepEqual(await publisher.publishPending(), ok({ published: 2, deferred: 0 }));
  assert.deepEqual(sent.map(([, id]) => id), ['e1', undefined]);
  assert.deepEqual(outbox.published, ['e1', 'o1']);
});

test('a failed publication is logged with its event identity and backoff', async () => {
  const sink = new InMemoryLogSink();
  const logger = new Logger(sink, new SimulatedHost(value(parseInstant('2026-10-25T10:00:00.000Z'))).wallClock);
  const outbox = new FakeOutbox([outboxRow('e1', 'workers.w1.commands'), outboxRow('e2', 'not.a.command')]);
  const publisher = new OutboxPublisher(outbox, new JetStreamPublisher(fakeBroker(new Set(['e1']), [])), address, { logger });
  assert.deepEqual(await publisher.publishPending(), ok({ published: 0, deferred: 2 }));
  const logged = sink.records.map(({ level, event, correlation, fields: { subject, failures, cause } }) => ({ level, event, correlation, subject, failures, cause }));
  assert.deepEqual(logged, [
    {
      level: 'warn', event: 'nats.outbox.publish-failed', correlation: { eventId: 'e1' }, subject: 'workers.w1.commands', failures: 1,
      cause: 'the broker could not publish on taskelith.install-1.workers.w1.commands',
    },
    {
      level: 'warn', event: 'nats.outbox.publish-failed', correlation: { eventId: 'e2' }, subject: 'not.a.command', failures: 1,
      cause: 'an outbox subject must be workers.<workerId>.commands or sdlc.events',
    },
  ]);
  const initial = TRANSPORT_LIMITS.retryInitialMilliseconds;
  for (const record of sink.records) {
    const delay = Number(record.fields['delayMilliseconds']);
    assert.ok(delay >= initial * 0.75 && delay <= initial);
  }
});

test('a broker failure is unavailable and names the subject', async () => {
  const publisher = new JetStreamPublisher(fakeBroker(new Set(['x']), []));
  const sent = await publisher.publish({ subject: 's', body: bytes({}), messageId: 'x' });
  assert.ok(!sent.ok);
  assert.equal(sent.error.code, 'unavailable');
  assert.deepEqual(sent.error.details, { cause: 'timeout' });
  assert.deepEqual(await publisher.publish({ subject: 's', body: bytes({}), messageId: 'y' }), ok('stored'));
  assert.deepEqual(await publisher.publish({ subject: 's', body: bytes({}), messageId: 'y' }), ok('duplicate'));
});

function deletingConsumers(failure?: Error): { deleted: string[]; jsm: JetStreamManager } {
  const deleted: string[] = [];
  const consumers = {
    delete: async (stream: string, name: string) => {
      if (failure !== undefined) throw failure;
      deleted.push(`${stream}/${name}`);
      return true;
    },
  };
  return { deleted, jsm: { consumers } as unknown as JetStreamManager };
}

const WORKER = 'worker-1' as WorkerId;
const apiError = (code: number) => new JetStreamApiError({ code: 404, err_code: code, description: 'not found' });

test('removing a worker command consumer deletes it, and one already gone counts as removed', async () => {
  const removed = deletingConsumers();
  value(await new NatsCommandConsumers(removed.jsm, ADDRESS.value).remove(WORKER));
  assert.deepEqual(removed.deleted, [`${ADDRESS.value.streamName('commands')}/worker-1`]);
  for (const code of [JetStreamApiCodes.ConsumerNotFound, JetStreamApiCodes.StreamNotFound]) {
    value(await new NatsCommandConsumers(deletingConsumers(apiError(code)).jsm, ADDRESS.value).remove(WORKER));
  }
  const refused = await new NatsCommandConsumers(deletingConsumers(new Error('timeout')).jsm, ADDRESS.value).remove(WORKER);
  assert.equal(refused.ok, false);
});

// A subscription whose test delivers each message and closes it.
function heartbeatConnection() {
  const subscribed: Array<{ subject: string; queue: string | undefined }> = [];
  let callback: ((error: Error | null, message: { subject: string; data: Uint8Array }) => void) | undefined;
  let closed = false;
  let close!: (cause?: Error) => void;
  const closing = new Promise<void | Error>((resolve) => { close = (cause) => { closed = true; resolve(cause); }; });
  const connection = {
    subscribe(subject: string, options: { queue?: string; callback: typeof callback }) {
      subscribed.push({ subject, queue: options.queue });
      callback = options.callback;
      return { closed: closing, isClosed: () => closed, unsubscribe: () => close() };
    },
  };
  return {
    connection: connection as unknown as NatsConnection,
    subscribed,
    close,
    deliver: (worker: string, body: unknown) => callback!(null, { subject: value(address.heartbeatSubject(worker)), data: bytes(body) }),
    fail: (error: Error) => callback!(error, undefined as never),
  };
}

function heartbeatLogger() {
  const sink = new InMemoryLogSink();
  return { sink, logger: new Logger(sink, new SimulatedHost(value(parseInstant('2026-10-25T10:00:00.000Z'))).wallClock) };
}

test('the heartbeat receiver handles valid heartbeats and logs what it drops or cannot record', async () => {
  const { sink, logger } = heartbeatLogger();
  const fake = heartbeatConnection();
  const subject = (worker: string) => value(address.heartbeatSubject(worker));
  const handled: string[] = [];
  const controller = new AbortController();
  const receiver = new HeartbeatReceiver({ connection: fake.connection, address, queue: 'control-plane' }, async (received) => {
    handled.push(received.subject);
    if (received.subject === subject('worker-3')) return err(failure('forbidden', 'not authenticated'));
    if (received.subject !== subject('worker-4')) return ok(undefined);
    controller.abort();
    throw new Error('defect');
  }, { logger });

  const running = receiver.run(controller.signal);
  fake.fail(new Error('permissions violation'));
  fake.deliver('worker-1', heartbeat('worker-1'));
  fake.deliver('worker-2', { ...heartbeat('worker-2'), sentAt: 'soon' });
  fake.deliver('worker-3', heartbeat('worker-3'));
  fake.deliver('worker-4', heartbeat('worker-4'));
  await running;
  assert.deepEqual(fake.subscribed, [{ subject: 'taskelith.install-1.workers.*.heartbeats', queue: 'control-plane' }]);
  assert.deepEqual(handled, [subject('worker-1'), subject('worker-3'), subject('worker-4')]);
  assert.deepEqual(sink.records.map((record) => [record.event, record.fields['reason'] ?? record.fields['cause']]), [
    ['nats.heartbeat.subscription-failed', 'permissions violation'],
    ['nats.heartbeat.dropped', sink.records[1]!.fields['reason']],
    ['nats.heartbeat.unrecorded', 'forbidden: not authenticated'],
    ['nats.heartbeat.unrecorded', 'defect'],
  ]);
  assert.match(String(sink.records[1]!.fields['reason']), /^violates WorkerHeartbeat: /);
});

test('the heartbeat receiver drops arrivals beyond its bound while a handler waits, and a stop handles no more', async () => {
  const { sink, logger } = heartbeatLogger();
  const fake = heartbeatConnection();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const handled: unknown[] = [];
  const receiver = new HeartbeatReceiver({ connection: fake.connection, address, queue: 'q' }, async (received) => {
    handled.push(received.body['workerId']);
    await blocked;
    return ok(undefined);
  }, { logger, maxPending: 2 });
  const controller = new AbortController();

  const running = receiver.run(controller.signal);
  fake.deliver('worker-1', heartbeat('worker-1'));
  await new Promise((resolve) => setImmediate(resolve));
  for (const worker of ['worker-2', 'worker-3', 'worker-4']) fake.deliver(worker, heartbeat(worker));
  controller.abort();
  release();
  await running;
  assert.deepEqual(handled, ['worker-1']);
  assert.deepEqual(sink.records.map((record) => [record.event, record.fields['subject'], record.fields['reason']]), [
    ['nats.heartbeat.dropped', value(address.heartbeatSubject('worker-4')), 'too many pending'],
  ]);

  const stopped = new AbortController();
  stopped.abort();
  await receiver.run(stopped.signal);
  assert.equal(fake.subscribed.length, 1);
});

test('a heartbeat subscription that closes without a stop fails the receiver with its cause', async () => {
  const fake = heartbeatConnection();
  const running = new HeartbeatReceiver({ connection: fake.connection, address, queue: 'q' }, async () => ok(undefined))
    .run(new AbortController().signal);
  fake.fail(new Error('permissions violation'));
  fake.close(new Error('permissions violation'));
  await assert.rejects(running, /^Error: the heartbeat subscription closed: permissions violation$/);
});

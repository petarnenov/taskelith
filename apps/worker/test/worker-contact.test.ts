import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { afterEach, beforeEach, test } from 'node:test';
import { checkMessageSchema } from '@taskelith/contracts';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { id } from '@taskelith/testing';
import {
  BrokerSession,
  HEARTBEAT_MILLISECONDS,
  LOST_CONTACT_MILLISECONDS,
  heartbeatMessage,
  runHeartbeats,
  TaskGroup,
  WorkerContact,
  type BrokerLink,
} from '@taskelith/worker';
import { flush, ManualTimers, StatusStream } from './contact-fakes.ts';
import { T0 } from './launch-fakes.ts';

let timers: ManualTimers;
let sink: InMemoryLogSink;
let stopping: AbortController;
let contact: WorkerContact;

beforeEach(() => {
  timers = new ManualTimers();
  sink = new InMemoryLogSink();
  stopping = new AbortController();
  contact = new WorkerContact({ sleep: timers.sleep, stopping: stopping.signal, logger: new Logger(sink, { now: () => T0 }) });
});

afterEach(() => stopping.abort());

function events(): string[] {
  return sink.records.map(({ event }) => event);
}

test('a worker is offline from its start until its first connection', async () => {
  assert.deepEqual([contact.offline, contact.connected], [true, false]);
  let online = false;
  void contact.whenOnline(new AbortController().signal).then(() => {
    online = true;
  });
  await flush();
  assert.equal(online, false);
  contact.linkUp();
  await flush();
  assert.deepEqual([online, contact.offline, contact.connected], [true, false, true]);
  assert.deepEqual(events(), ['worker.contact.online']);
  await contact.whenOnline(new AbortController().signal);
});

test('a lost connection makes the worker offline only after the lost-contact timeout', async () => {
  contact.linkUp();
  contact.linkDown();
  contact.linkDown();
  assert.deepEqual(timers.waiting, [LOST_CONTACT_MILLISECONDS]);
  assert.deepEqual([contact.offline, contact.connected], [false, false]);
  timers.elapse(LOST_CONTACT_MILLISECONDS);
  await flush();
  assert.equal(contact.offline, true);
  assert.deepEqual(sink.records.at(-1)?.fields, { afterMilliseconds: LOST_CONTACT_MILLISECONDS });
  contact.linkUp();
  assert.equal(contact.offline, false);
  assert.deepEqual(events(), ['worker.contact.online', 'worker.contact.offline', 'worker.contact.online']);
});

test('a connection restored within the timeout keeps the worker online', async () => {
  contact.linkUp();
  contact.linkDown();
  contact.linkUp();
  await flush();
  assert.deepEqual(timers.waiting, []);
  assert.equal(contact.offline, false);
  assert.deepEqual(events(), ['worker.contact.online']);
});

test('a stop ends the lost-contact timer, and an aborted wait resolves', async () => {
  contact.linkUp();
  contact.linkDown();
  stopping.abort();
  await flush();
  assert.equal(contact.offline, false);
  const offline = new WorkerContact({ sleep: timers.sleep, stopping: stopping.signal });
  const waiting = new AbortController();
  const waited = offline.whenOnline(waiting.signal);
  waiting.abort();
  await waited;
  assert.equal(offline.offline, true);
  await offline.whenOnline(waiting.signal);
});

const BINDING = { workerId: id('WorkerId', 'worker-1'), journalId: id('JournalId', 'journal-1') };

test('the heartbeat message matches the contract', () => {
  const message = heartbeatMessage(BINDING, T0);
  assert.equal(checkMessageSchema('WorkerHeartbeat', message).ok, true);
  assert.deepEqual(message, {
    messageType: 'worker.heartbeat', schemaVersion: 1, protocolVersion: 1, workerId: 'worker-1', journalId: 'journal-1', sentAt: T0,
  });
});

test('heartbeats go out at once and at each interval, only while connected', async () => {
  const sent: Array<{ subject: string; body: Record<string, unknown> }> = [];
  let connected = true;
  let answer: Result<void> = ok(undefined);
  const signal = new AbortController();
  const running = runHeartbeats({
    binding: BINDING, subject: 'heartbeats', now: () => T0, sleep: timers.sleep, canSend: () => connected,
    logger: new Logger(sink, { now: () => T0 }),
    send: (subject, body) => {
      sent.push({ subject, body: JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown> });
      return answer;
    },
  }, signal.signal);
  await flush();
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], { subject: 'heartbeats', body: heartbeatMessage(BINDING, T0) });
  assert.deepEqual(timers.waiting, [HEARTBEAT_MILLISECONDS]);
  connected = false;
  timers.elapse(HEARTBEAT_MILLISECONDS);
  await flush();
  assert.equal(sent.length, 1);
  connected = true;
  answer = err(failure('unavailable', 'refused'));
  timers.elapse(HEARTBEAT_MILLISECONDS);
  await flush();
  assert.equal(sent.length, 2);
  assert.deepEqual(events(), ['worker.heartbeat.unsent']);
  signal.abort();
  await running;
});

// A link the test drives through its statuses.
class FakeLink implements BrokerLink {
  readonly statuses = new StatusStream();
  closed = 0;
  closeError: Error | undefined;

  close(): Promise<void> {
    this.closed += 1;
    this.statuses.end();
    return this.closeError === undefined ? Promise.resolve() : Promise.reject(this.closeError);
  }
}

interface SessionTrace {
  readonly links: FakeLink[];
  readonly served: AbortSignal[];
  readonly ups: AbortSignal[];
  answers: Array<Result<FakeLink> | Promise<Result<FakeLink>> | undefined>;
}

type Work = (signal: AbortSignal) => Promise<void>;

function session(trace: SessionTrace, serve?: Work, linkUp?: Work): BrokerSession<FakeLink> {
  return new BrokerSession<FakeLink>({
    connect: async () => {
      const answer = trace.answers.shift();
      if (answer !== undefined) return answer;
      const link = new FakeLink();
      trace.links.push(link);
      return ok(link);
    },
    serve: async (_link, signal) => {
      trace.served.push(signal);
      if (serve !== undefined) return serve(signal);
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
    },
    linkUp: async (_link, signal) => {
      trace.ups.push(signal);
      if (linkUp !== undefined) await linkUp(signal);
    },
    contact, sleep: timers.sleep, draw: () => 0, logger: new Logger(sink, { now: () => T0 }),
  });
}

function newTrace(): SessionTrace {
  return { links: [], served: [], ups: [], answers: [] };
}

test('a failed first connection starts the worker offline and is retried with backoff', async () => {
  const trace = newTrace();
  trace.answers = [err(failure('unavailable', 'no broker')), err(failure('unavailable', 'no broker'))];
  const running = session(trace).run(stopping.signal);
  await flush();
  assert.deepEqual([trace.links.length, contact.offline, timers.waiting], [0, true, [5_000]]);
  timers.elapse(5_000);
  await flush();
  assert.deepEqual(timers.waiting, [10_000]);
  timers.elapse(10_000);
  await flush();
  assert.deepEqual([trace.links.length, trace.served.length, trace.ups.length, contact.offline], [1, 1, 1, false]);
  const failures = sink.records.filter(({ event }) => event === 'worker.broker.connect-failed').map(({ fields }) => fields);
  assert.deepEqual(failures, [{ retry: 1, reason: 'no broker' }, { retry: 2, reason: 'no broker' }]);
  stopping.abort();
  await running;
  assert.deepEqual([trace.links[0]?.closed, trace.served[0]?.aborted], [1, true]);
});

test('a disconnect ends the link-up work; a reconnect starts it again and restores contact', async () => {
  const trace = newTrace();
  const running = session(trace).run(stopping.signal);
  await flush();
  const [link] = trace.links;
  assert.ok(link);
  link.statuses.push('disconnect');
  await flush();
  assert.deepEqual([trace.ups[0]?.aborted, contact.connected, trace.served[0]?.aborted], [true, false, false]);
  link.statuses.push('ping');
  link.statuses.push('reconnect');
  await flush();
  assert.deepEqual([trace.ups.length, trace.ups[1]?.aborted, contact.connected], [2, false, true]);
  link.statuses.push('reconnect');
  await flush();
  assert.deepEqual([trace.ups.length, trace.ups[1]?.aborted], [3, true]);
  stopping.abort();
  await running;
  assert.equal(trace.ups[2]?.aborted, true);
});

test('a link that closes without a stop is closed and a new one connected', async () => {
  const trace = newTrace();
  const running = session(trace).run(stopping.signal);
  await flush();
  trace.links[0]?.statuses.end();
  await flush();
  assert.deepEqual([trace.links.length, trace.links[0]?.closed, trace.served[0]?.aborted], [2, 1, true]);
  assert.equal(contact.connected, true);
  stopping.abort();
  await running;
});

test('a failed close or serve reaches the caller after the link is closed', async () => {
  const trace = newTrace();
  const failing = session(trace, async () => Promise.reject(new Error('serve failed')));
  await assert.rejects(failing.run(stopping.signal), /serve failed/);
  assert.deepEqual([trace.links[0]?.closed, contact.connected], [1, false]);
  const closing = newTrace();
  const link = new FakeLink();
  link.closeError = new Error('close failed');
  closing.answers = [ok(link)];
  const running = session(closing).run(stopping.signal);
  await flush();
  stopping.abort();
  await assert.rejects(running, /close failed/);
});

test('a failed serve aborts the link-up work and closes the link after it ended', async () => {
  const trace = newTrace();
  let failServe: (error: Error) => void = () => undefined;
  let endUp: () => void = () => undefined;
  const serve: Work = async () => new Promise((_resolve, reject) => {
    failServe = reject;
  });
  const up: Work = async (signal) => new Promise((resolve) => {
    signal.addEventListener('abort', () => {
      endUp = resolve;
    }, { once: true });
  });
  const running = session(trace, serve, up).run(stopping.signal);
  await flush();
  failServe(new Error('serve failed'));
  await flush();
  assert.deepEqual([trace.ups[0]?.aborted, trace.links[0]?.closed], [true, 0]);
  endUp();
  await assert.rejects(running, /serve failed/);
  assert.equal(trace.links[0]?.closed, 1);
});

test('the status watcher keeps no listener per status event', async () => {
  const trace = newTrace();
  const running = session(trace).run(stopping.signal);
  await flush();
  const [link] = trace.links;
  const [signal] = trace.served;
  assert.ok(link && signal);
  const listeners = getEventListeners(signal, 'abort').length;
  for (let event = 0; event < 100; event += 1) link.statuses.push('pingTimer');
  await flush();
  assert.equal(getEventListeners(signal, 'abort').length, listeners);
  stopping.abort();
  await running;
});

test('a stop during the connection backoff retries nothing', async () => {
  const trace = newTrace();
  trace.answers = [err(failure('unavailable', 'no broker'))];
  const running = session(trace).run(stopping.signal);
  await flush();
  stopping.abort();
  await running;
  assert.deepEqual([trace.links.length, timers.waiting], [0, []]);
});

interface Settle {
  resolve: (link: FakeLink) => void;
  reject: (error: Error) => void;
}

interface PendingAttempt {
  readonly attempt: Promise<Result<FakeLink>>;
  readonly settle: Settle;
}

// A connection attempt that settles only when the test settles it.
function pendingAttempt(): PendingAttempt {
  const settle: Settle = { resolve: () => undefined, reject: () => undefined };
  const attempt = new Promise<Result<FakeLink>>((resolve, reject) => {
    settle.resolve = (link) => resolve(ok(link));
    settle.reject = reject;
  });
  return { attempt, settle };
}

test('a stop does not wait for a pending connection, and closes its late link', async () => {
  const trace = newTrace();
  const pending = pendingAttempt();
  trace.answers = [pending.attempt];
  const running = session(trace).run(stopping.signal);
  await flush();
  stopping.abort();
  await running;
  const late = new FakeLink();
  pending.settle.resolve(late);
  await flush();
  assert.deepEqual([late.closed, trace.served.length, contact.connected], [1, 0, false]);
});

test('a pending connection that fails after a stop is only logged', async () => {
  const trace = newTrace();
  const pending = pendingAttempt();
  trace.answers = [pending.attempt];
  const running = session(trace).run(stopping.signal);
  await flush();
  stopping.abort();
  await running;
  pending.settle.reject(new Error('lookup failed'));
  await flush();
  const late = sink.records.filter(({ event }) => event === 'worker.broker.late-attempt-failed');
  assert.deepEqual(late.map(({ fields }) => fields), [{ reason: 'lookup failed' }]);
});

// A task the test ends; `end` settles it.
function pendingTask(): { readonly task: Promise<void>; readonly end: () => void } {
  let end: () => void = () => undefined;
  const task = new Promise<void>((resolve) => {
    end = resolve;
  });
  return { task, end };
}

test('a task group retains no ended task across reconnect cycles', async () => {
  const group = new TaskGroup(stopping.signal);
  for (let cycle = 0; cycle < 100; cycle += 1) {
    const up = pendingTask();
    group.add(up.task);
    up.end();
    await flush();
    assert.equal(group.running, 0);
  }
});

test('a task group waits for tasks added while it waits, then rethrows the first failure', async () => {
  const group = new TaskGroup(stopping.signal);
  const first = pendingTask();
  group.add(first.task);
  let settled = false;
  const waiting = group.settled().finally(() => {
    settled = true;
  });
  const late = pendingTask();
  group.add(late.task);
  group.add(Promise.reject(new Error('first failure')));
  group.add(Promise.reject(new Error('second failure')));
  first.end();
  await flush();
  assert.deepEqual([settled, group.running, group.signal.aborted], [false, 1, true]);
  late.end();
  await assert.rejects(waiting, /first failure/);
  assert.equal(group.running, 0);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { EventStreamHub, KEEP_ALIVE_MILLISECONDS, type LoginSession, type StreamSubject } from '@taskelith/control-plane';
import { INSTALLATION_SCOPE, InMemoryUiEventLog, projectScope, type PrincipalId, type UiEventScope } from '@taskelith/execution';
import { err, failure, ok, type Instant } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { failed, value } from '@taskelith/testing';
import { ALPHA, AT, BETA, ManualClock, ManualScheduler, RecordingSink, changeEntry, committed, eventEntry, marked } from './event-stream-fixtures.ts';

const VERA = 'vera' as PrincipalId;
const OTHER = 'otto' as PrincipalId;

function setup(options: { readPage?: number } = {}) {
  const log = new InMemoryUiEventLog();
  const scheduler = new ManualScheduler();
  const clock = new ManualClock();
  const logs = new InMemoryLogSink();
  const hub = new EventStreamHub({ log, scheduler, clock, logger: new Logger(logs, { now: () => AT }), ...options });
  return { log, scheduler, clock, logs, hub };
}

function subject(scope: UiEventScope = projectScope(ALPHA), login?: LoginSession): StreamSubject {
  return { scope, principalId: VERA, reauthorize: async () => ok(undefined), ...(login === undefined ? {} : { login }) };
}

// A login session whose expiry the test sets; undefined once it ended.
function login(until: Instant | undefined) {
  const session = { until, reads: 0, liveUntil: async () => (session.reads++, ok(session.until)) };
  return session;
}

async function opened(hub: EventStreamHub, cursor?: number, of: StreamSubject = subject()) {
  const sink = new RecordingSink();
  const detach = value(await hub.open(of, cursor)).attach(sink);
  return { sink, detach };
}

test('a stream without a cursor starts at the head and sends what is numbered after it, in order, with positions', async () => {
  const { log, hub } = setup();
  await committed(log, eventEntry(marked(1)), eventEntry(marked(2)));
  const { sink } = await opened(hub);
  await committed(log, eventEntry(marked(3)), eventEntry(marked(4, projectScope(BETA))), eventEntry(marked(5, INSTALLATION_SCOPE)), eventEntry(marked(6)));
  hub.wake();
  await sink.until((recorded) => recorded.frames.length === 2);
  assert.deepEqual(sink.marks(), [3, 6], 'only events of the stream\'s project, from the head on');
  assert.deepEqual(sink.frames.map((frame) => (frame.kind === 'event' ? frame.position : 0)), [3, 6]);
  assert.equal(sink.closed, false);
});

test('a stream resumes after its cursor, and reads a long backlog in pages', async () => {
  const { log, hub } = setup({ readPage: 2 });
  await committed(log, ...[1, 2, 3, 4, 5, 6, 7].map((mark) => eventEntry(marked(mark))));
  const { sink } = await opened(hub, 2);
  await sink.until((recorded) => recorded.frames.length === 5);
  assert.deepEqual(sink.marks(), [3, 4, 5, 6, 7]);
});

test('a cursor below the retention floor answers cursor-expired, one beyond the head cursor-unknown, and both end the stream', async () => {
  const { log, hub, clock } = setup();
  await committed(log, eventEntry(marked(1)), eventEntry(marked(2)), eventEntry(marked(3)));
  clock.advance(1);
  value(await log.prune(clock.now(), 2));
  assert.deepEqual(value(await log.bounds()), { floor: 2, head: 3 });
  for (const [cursor, expected] of [[1, 'cursor-expired'], [4, 'cursor-unknown']] as const) {
    const { sink } = await opened(hub, cursor);
    assert.deepEqual([sink.frames, sink.closed], [[{ kind: 'resync', reason: expected }], true]);
  }
  const atFloor = await opened(hub, 2);
  await atFloor.sink.until((recorded) => recorded.frames.length === 1);
  assert.deepEqual(atFloor.sink.marks(), [3], 'a cursor at the floor resumes');
  assert.equal(hub.openStreams(), 1, 'a resync registers no stream');
});

test('a floor raised past a stream\'s cursor before it read sends cursor-expired and ends the stream', async () => {
  const { log, hub, clock } = setup();
  const { sink } = await opened(hub);
  await committed(log, eventEntry(marked(1)), eventEntry(marked(2)));
  clock.advance(1);
  value(await log.prune(clock.now(), 1));
  hub.wake();
  await sink.until((recorded) => recorded.closed);
  assert.deepEqual(sink.frames, [{ kind: 'resync', reason: 'cursor-expired' }]);
  assert.equal(hub.openStreams(), 0);
});

test('a change of the principal\'s role in the project or of its installation role ends the stream with stream-ended', async () => {
  for (const change of [{ projectId: ALPHA }, {}]) {
    const { log, hub } = setup();
    const { sink } = await opened(hub);
    await committed(log, eventEntry(marked(1)), changeEntry({ change: 'roles-changed', principalId: VERA, ...change }), eventEntry(marked(2)));
    hub.wake();
    await sink.until((recorded) => recorded.closed);
    assert.deepEqual(sink.marks(), [1, 'stream-ended']);
    assert.deepEqual(sink.frames.at(-1), { kind: 'stream-ended', reason: 'role-changed' });
    assert.equal(hub.openStreams(), 0);
  }
});

test('a role change of another project or principal, or one before the open, leaves the stream open', async () => {
  const { log, hub } = setup();
  await committed(log, changeEntry({ change: 'roles-changed', principalId: VERA, projectId: ALPHA }));
  const { sink } = await opened(hub, 0);
  await committed(log,
    changeEntry({ change: 'roles-changed', principalId: VERA, projectId: BETA }),
    changeEntry({ change: 'roles-changed', principalId: OTHER, projectId: ALPHA }),
    eventEntry(marked(1)));
  hub.wake();
  await sink.until((recorded) => recorded.frames.length === 1);
  assert.deepEqual([sink.marks(), sink.closed], [[1], false]);
});

test('the installation stream ends on a change of the installation role, not on a project role', async () => {
  const { log, hub } = setup();
  const { sink } = await opened(hub, undefined, subject(INSTALLATION_SCOPE));
  await committed(log,
    changeEntry({ change: 'roles-changed', principalId: VERA, projectId: ALPHA }),
    eventEntry(marked(1, INSTALLATION_SCOPE)),
    changeEntry({ change: 'roles-changed', principalId: VERA }));
  hub.wake();
  await sink.until((recorded) => recorded.closed);
  assert.deepEqual(sink.marks(), [1, 'stream-ended']);
});

test('the end of the principal\'s sessions ends a browser stream whose login ended, without a frame, and no other stream', async () => {
  const { log, hub } = setup();
  const ended = login(AT);
  const live = login(AT);
  const browser = await opened(hub, undefined, subject(projectScope(ALPHA), ended));
  const other = await opened(hub, undefined, subject(projectScope(ALPHA), live));
  const bearer = await opened(hub);
  ended.until = undefined;
  await committed(log, changeEntry({ change: 'sessions-ended', principalId: VERA }), eventEntry(marked(1)));
  hub.wake();
  await browser.sink.until((recorded) => recorded.closed);
  await other.sink.until((recorded) => recorded.frames.length === 1);
  await bearer.sink.until((recorded) => recorded.frames.length === 1);
  assert.deepEqual([browser.sink.frames, other.sink.marks(), bearer.sink.marks()], [[], [1], [1]]);
  assert.equal(hub.openStreams(), 2);
});

test('a browser stream ends when its login expires, checked again when its expiry passes, and a renewed login keeps it', async () => {
  const { hub, scheduler, clock } = setup();
  const session = login(new Date(Date.parse(AT) + 60_000).toISOString() as Instant);
  const { sink } = await opened(hub, undefined, subject(projectScope(ALPHA), session));
  await scheduler.armed(60_000);
  session.until = new Date(Date.parse(AT) + 90_000).toISOString() as Instant;
  clock.advance(60_000);
  assert.equal(scheduler.fire(60_000), 1);
  await scheduler.armed(30_000);
  assert.equal(sink.closed, false, 'the renewed login keeps the stream');
  session.until = undefined;
  scheduler.fire(30_000);
  await sink.until((recorded) => recorded.closed);
  assert.deepEqual(sink.frames, []);
  assert.deepEqual(scheduler.delays(), [], 'a closed stream holds no timer');
});

test('a login that cannot be read ends the stream, which the client then reopens', async () => {
  const { hub, logs } = setup();
  const broken: LoginSession = { liveUntil: async () => err(failure('unavailable', 'the sessions cannot be read')) };
  const { sink } = await opened(hub, undefined, subject(projectScope(ALPHA), broken));
  await sink.until((recorded) => recorded.closed);
  assert.ok(logs.records.some((record) => record.event === 'events.stream.read.failed'));
});

test('an idle stream sends a keep-alive comment each interval', async () => {
  const { hub, scheduler } = setup();
  const { sink } = await opened(hub);
  assert.equal(scheduler.fire(KEEP_ALIVE_MILLISECONDS), 1);
  assert.equal(scheduler.fire(KEEP_ALIVE_MILLISECONDS), 1);
  assert.deepEqual(sink.frames, [{ kind: 'keep-alive' }, { kind: 'keep-alive' }]);
});

test('a stream whose buffer is full ends, and the other streams go on', async () => {
  const { log, hub, logs } = setup();
  const slow = await opened(hub);
  const fast = await opened(hub);
  slow.sink.accepts = false;
  await committed(log, eventEntry(marked(1)), eventEntry(marked(2)));
  hub.wake();
  await slow.sink.until((recorded) => recorded.closed);
  await fast.sink.until((recorded) => recorded.frames.length === 2);
  assert.deepEqual([slow.sink.marks(), fast.sink.marks()], [[1], [1, 2]]);
  assert.ok(logs.records.some((record) => record.event === 'events.stream.overflow'));
});

test('a wake during a read reads again, and a detached stream reads nothing more', async () => {
  const { log, hub } = setup();
  const { sink, detach } = await opened(hub);
  await committed(log, eventEntry(marked(1)));
  hub.wake();
  await committed(log, eventEntry(marked(2)));
  hub.wake();
  await sink.until((recorded) => recorded.frames.length === 2);
  detach();
  await committed(log, eventEntry(marked(3)));
  hub.wake();
  assert.deepEqual([sink.marks(), sink.closed, hub.openStreams()], [[1, 2], true, 0]);
});

test('the open fails when the role check fails again or the log cannot be read, and close ends every stream', async () => {
  const { hub, log } = setup();
  const denied = { ...subject(), reauthorize: async () => err(failure('forbidden', 'the role was lost')) };
  assert.equal(failed(await hub.open(denied, undefined)).code, 'forbidden');
  const broken = new EventStreamHub({
    log: { bounds: async () => err(failure('unavailable', 'down')), readAfter: (...args) => log.readAfter(...args) },
    scheduler: new ManualScheduler(), clock: new ManualClock(), logger: new Logger(new InMemoryLogSink(), { now: () => AT }),
  });
  assert.equal(failed(await broken.open(subject(), undefined)).code, 'unavailable');
  const { sink } = await opened(hub);
  hub.close();
  assert.deepEqual([sink.closed, hub.openStreams()], [true, 0]);
});

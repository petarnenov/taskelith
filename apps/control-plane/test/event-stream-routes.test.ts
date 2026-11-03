import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import {
  AuthorizationService,
  InMemoryAccessStore,
  LoginThrottle,
  OwnerBootstrapService,
  PrincipalAdministration,
  ProjectSetupService,
  SessionService,
  type PrincipalId,
} from '@taskelith/access';
import { checkHttpSchema } from '@taskelith/contracts';
import {
  ControlPlaneApi,
  EventLogKeeper,
  EventStreamApi,
  EventStreamHub,
  MAX_STREAM_BUFFER_BYTES,
  createApiServer,
  mintTurnId,
  type ApiRequest,
  type ApiServices,
} from '@taskelith/control-plane';
import {
  INSTALLATION_SCOPE,
  InMemorySessionTimelineStore,
  InMemoryTaskLineage,
  InMemoryUiEventLog,
  SessionTimelineService,
  parseSessionGeneration,
  projectScope,
  type NeedsYouItem,
} from '@taskelith/execution';
import { err, failure, ok, parseIdentifier, parseInstant, type CorrelationId } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { parseOwnershipGeneration, type TaskId } from '@taskelith/sdlc';
import { Argon2idPasswordHasher, NodeSecrets, SecretOutputRedactor, outputTailCipher } from '@taskelith/secrets';
import { sequentialIds, value } from '@taskelith/testing';
import { ALPHA, AT, ManualScheduler, eventEntry, marked } from './event-stream-fixtures.ts';
import { addProjects } from './project-fixtures.ts';

const OPERATOR = `tkop_${'E'.repeat(43)}`;
const PASSWORD = 'password of the event stream test';
const INVOCATION = { actor: 'root@control-plane-1', reason: 'event stream route test' };

// Access records its principal changes into the same log as the timeline.
const log = new InMemoryUiEventLog();
const store = new InMemoryAccessStore({ committed: (changes) => log.commit(changes.map((change) => ({ kind: 'principal-change', change: change as never }))) });
const secrets = new NodeSecrets();
const clock = { now: () => AT };
const hasher = value(Argon2idPasswordHasher.create({ parameters: { memoryKib: 64, passes: 1, parallelism: 1 } }));
const sessions = new SessionService({ store, hasher, secrets, random: secrets, clock, throttle: new LoginThrottle({ clock, sleep: async () => undefined }) });
const administration = new PrincipalAdministration({ store, hasher, random: secrets, clock });
const owner = value(await new OwnerBootstrapService({ store, random: secrets, clock }).ensureOwner(INVOCATION)).principalId;
value(await administration.setPassword(owner, 'owner', PASSWORD, INVOCATION));
await addProjects(store, ['alpha', 'beta'], clock.now());
const principals = new Map<string, PrincipalId>();
for (const [loginName, projectId] of [['vera', 'alpha'], ['vince', 'alpha'], ['nora', undefined]] as const) {
  principals.set(loginName, value(await administration.createPrincipal(owner, loginName, INVOCATION)).principalId);
  value(await administration.setPassword(owner, loginName, PASSWORD, INVOCATION));
  if (projectId !== undefined) value(await administration.assignProjectRole(owner, { projectId, loginName, role: 'project-viewer' }, INVOCATION));
}

const logs = new InMemoryLogSink();
const logger = new Logger(logs, clock);
const scheduler = new ManualScheduler();
const hub = new EventStreamHub({ log, scheduler, clock, logger });
const keeper = new EventLogKeeper({ log, clock });
// The setup's role changes precede every stream of the tests.
value(await keeper.numberCommitted());
const authorization = new AuthorizationService(store);
const projectSetup = new ProjectSetupService({ store, random: secrets, clock });
const events = { hub, projects: projectSetup, authorization, sessions, logger };
const api = new ControlPlaneApi({
  operator: { authenticate: async (secret: string) => (secret === OPERATOR ? ok(owner) : err(failure('forbidden', 'not the operator'))) },
  sessions, authorization, events, projects: { setup: projectSetup },
} as unknown as ApiServices);
const server = createApiServer(api);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => {
  hub.close();
  return new Promise<void>((resolve) => server.close(() => resolve()));
});

const BEARER = { authorization: `Bearer ${OPERATOR}` };

// A logged-in browser's headers, with the CSRF header of its session.
async function browser(loginName: string): Promise<Record<string, string>> {
  const anonymous = await fetch(`${base}/session`);
  const cookie = /^(__Host-taskelith-session=[^;]*);/.exec(anonymous.headers.get('set-cookie') ?? '')![1]!;
  const csrf = String((await anonymous.json() as { csrfToken: string }).csrfToken);
  const loggedIn = await fetch(`${base}/session`, {
    method: 'POST', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify({ loginName, password: PASSWORD }),
  });
  const rotated = /^(__Host-taskelith-session=[^;]*);/.exec(loggedIn.headers.get('set-cookie') ?? '')![1]!;
  return { cookie: rotated, 'x-csrf-token': String((await loggedIn.json() as { csrfToken: string }).csrfToken) };
}

interface Frame {
  readonly id?: string;
  readonly event?: string;
  readonly data?: Record<string, unknown>;
  readonly comment?: string;
}

// The frames of one open stream, read as the server sends them.
class OpenStream {
  readonly #reader: ReadableStreamDefaultReader<Uint8Array>;
  readonly #decoder = new TextDecoder();
  #buffered = '';

  readonly response: Response;

  constructor(response: Response) {
    this.response = response;
    this.#reader = response.body!.getReader();
  }

  // The next frame, or undefined once the server ended the stream.
  async next(): Promise<Frame | undefined> {
    for (;;) {
      const end = this.#buffered.indexOf('\n\n');
      if (end >= 0) {
        const block = this.#buffered.slice(0, end);
        this.#buffered = this.#buffered.slice(end + 2);
        return frameOf(block);
      }
      const read = await this.#reader.read();
      if (read.done) return undefined;
      this.#buffered += this.#decoder.decode(read.value, { stream: true });
    }
  }

  cancel(): Promise<void> {
    return this.#reader.cancel();
  }
}

function frameOf(block: string): Frame {
  const frame: Record<string, unknown> = {};
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) frame.comment = line.slice(1).trim();
    const [, field, text] = /^(id|event|data): (.*)$/.exec(line) ?? [];
    if (field === 'data') frame.data = JSON.parse(text!);
    else if (field !== undefined) frame[field] = text;
  }
  return frame as Frame;
}

async function open(path: string, headers: Record<string, string>): Promise<OpenStream> {
  const response = await fetch(`${base}${path}`, { headers });
  const stream = new OpenStream(response);
  after(() => stream.cancel().catch(() => undefined));
  return stream;
}

async function refusal(path: string, headers: Record<string, string>): Promise<number> {
  const response = await fetch(`${base}${path}`, { headers });
  assert.equal(response.headers.get('content-type'), 'application/json');
  await response.arrayBuffer();
  return response.status;
}

// The assigner numbers what was committed, and the streams read it.
async function publish(): Promise<void> {
  value(await keeper.numberCommitted());
  hub.wake();
}

const head = async () => value(await log.bounds()).head;

test('a project stream is a no-store text/event-stream whose events each carry an id, an event, and one data line', async () => {
  const stream = await open('/projects/alpha/events', BEARER);
  assert.equal(stream.response.status, 200);
  assert.equal(stream.response.headers.get('content-type'), 'text/event-stream');
  assert.equal(stream.response.headers.get('cache-control'), 'no-store');
  const before = await head();
  log.commit([eventEntry(marked(4)), eventEntry(marked(5, projectScope('beta' as never))), eventEntry(marked(6, INSTALLATION_SCOPE))]);
  await publish();
  const frame = await stream.next();
  assert.deepEqual(frame, {
    id: String(before + 1), event: 'board-changed',
    data: { type: 'board-changed', position: String(before + 1), occurredAt: AT, projectId: 'alpha', workersOnline: 4 },
  });
  scheduler.fire(15_000);
  assert.deepEqual(await stream.next(), { comment: 'keep-alive' }, 'no event of another scope comes before the keep-alive');
});

test('the events of a session\'s changes carry the records that its reads return, each valid against ProjectEvent', async () => {
  const lineage = new InMemoryTaskLineage({ runs: [{ runId: 'run-alpha', projectId: 'alpha' }], tasks: [] });
  const timeline = new SessionTimelineService({
    store: new InMemorySessionTimelineStore(lineage, log), digest: { digest: (input) => `digest:${input}` }, redactor: { redact: (text) => text },
    outputRedactor: new SecretOutputRedactor(), tailCipher: value(outputTailCipher(randomBytes(32))),
    turnIds: { next: mintTurnId }, clock, itemIds: sequentialIds('NeedsYouItemId', 'item'),
  });
  const id = <Kind extends string>(kind: Kind, text: string) => value(parseIdentifier(kind, text));
  const taskId = id('TaskId', 'task-events') as TaskId;
  lineage.addTask({ taskId, rootTaskId: taskId, depth: 0, projectId: ALPHA, runId: 'run-alpha' as never });
  const stream = await open('/projects/alpha/events', BEARER);
  const sessionId = id('SessionId', 's-events');
  const generation = value(parseSessionGeneration(1));
  value(await timeline.openSession({ id: sessionId, taskId, harness: id('HarnessPluginId', 'harness-a') }));
  value(await timeline.bindAttempt(sessionId, { attemptId: id('AttemptId', 'attempt-events'), taskId, ownershipGeneration: value(parseOwnershipGeneration(1)) }));
  value(await timeline.startGeneration(sessionId, { generation, nativeSessionId: id('NativeSessionId', 'native-1') }));
  const submitted = value(await timeline.submitTurn(sessionId, { key: id('IdempotencyKey', 'key-1'), author: { kind: 'principal', principalId: id('PrincipalId', 'person-1') }, text: 'go' }));
  value(await timeline.deliverTurn(sessionId, { turnId: submitted.turn.id, generation }));
  value(await timeline.recordRequest(sessionId, { key: { generation, nativeRequestId: id('NativeRequestId', 'request-1') }, kind: 'permission-request', turnId: submitted.turn.id, text: 'may I' }));
  value(await timeline.appendOutput(sessionId, { turnId: submitted.turn.id, generation, text: 'done\n' }));
  await publish();
  const types: string[] = [];
  while (types.at(-1) !== 'output-appended') {
    const frame = (await stream.next())!;
    assert.equal(checkHttpSchema('ProjectEvent', frame.data).ok, true, JSON.stringify(frame.data));
    assert.equal(frame.id, frame.data!.position);
    types.push(frame.event!);
  }
  assert.deepEqual(types, [
    'agent-session-changed', 'agent-session-changed', 'agent-session-changed', 'turn-changed', 'turn-changed',
    'native-request-changed', 'inbox-item-changed', 'output-appended',
  ]);
  assert.equal(logs.records.filter((record) => record.event === 'events.stream.invalid-event').length, 0);
});

test('Last-Event-ID wins over after, a reconnect resumes after it, and with neither the stream starts at the head', async () => {
  log.commit([eventEntry(marked(11)), eventEntry(marked(12)), eventEntry(marked(13))]);
  await publish();
  const top = await head();
  const resumed = await open(`/projects/alpha/events?after=${top - 3}`, { ...BEARER, 'last-event-id': String(top - 1) });
  assert.deepEqual((await resumed.next())?.data?.workersOnline, 13);
  const fromAfter = await open(`/projects/alpha/events?after=${top - 2}`, BEARER);
  assert.deepEqual([(await fromAfter.next())?.data?.workersOnline, (await fromAfter.next())?.data?.workersOnline], [12, 13]);
  const fresh = await open('/projects/alpha/events', BEARER);
  log.commit([eventEntry(marked(14))]);
  await publish();
  assert.deepEqual((await fresh.next())?.data?.workersOnline, 14);
});

test('a cursor beyond the head answers 200 with a cursor-unknown resync and ends, and one below the floor cursor-expired', async () => {
  const beyond = await open(`/projects/alpha/events?after=${(await head()) + 1}`, BEARER);
  assert.equal(beyond.response.status, 200);
  assert.deepEqual(await beyond.next(), { event: 'resync', data: { type: 'resync', reason: 'cursor-unknown' } });
  assert.equal(await beyond.next(), undefined);
  const huge = await open('/events?after=9999999999999999', BEARER);
  assert.deepEqual((await huge.next())?.data, { type: 'resync', reason: 'cursor-unknown' });
  const pruning = new EventLogKeeper({ log, clock: { now: () => value(parseInstant('2026-11-05T09:00:00.000Z')) } });
  value(await pruning.prune());
  const expired = await open('/projects/alpha/events?after=0', BEARER);
  assert.deepEqual(await expired.next(), { event: 'resync', data: { type: 'resync', reason: 'cursor-expired' } });
  assert.equal(await expired.next(), undefined);
});

test('a malformed after or Last-Event-ID answers 400 before any stream opens', async () => {
  for (const [path, headers] of [
    ['/projects/alpha/events?after=01', BEARER], ['/projects/alpha/events?after=-1', BEARER],
    ['/events', { ...BEARER, 'last-event-id': 'x' }], ['/projects/alpha/events?after=1', { ...BEARER, 'last-event-id': '' }],
  ] as const) {
    const response = await fetch(`${base}${path}`, { headers });
    assert.deepEqual([response.status, (await response.json() as { code: string }).code], [400, 'invalid'], path);
  }
});

test('the streams need a credential, a role on the project or the owner\'s, and an existing project', async () => {
  const nora = await browser('nora');
  const vera = await browser('vera');
  for (const [path, headers, status] of [
    ['/projects/alpha/events', {}, 401], ['/events', {}, 401],
    ['/projects/alpha/events', nora, 403], ['/projects/beta/events', vera, 403], ['/events', vera, 403],
    ['/projects/gamma/events', BEARER, 404],
  ] as const) {
    assert.equal(await refusal(path, headers), status, `${path} ${status}`);
  }
});

test('the installation stream carries the installation-scoped inbox events to the owner, and no project\'s', async () => {
  const stream = await open('/events', BEARER);
  const item = {
    id: 'item-installation', sourceId: 'reconciliation', kind: 'reconciliation', reconciliationReason: 'unrecorded-process',
    containment: 'contained', processCount: 2, subject: { scope: 'installation', workerId: 'worker-1', journalId: 'journal-1', observationId: 'obs-1' },
    title: 'A process that no journal names', createdAt: AT, answerableBy: 'installation-owner', state: 'open',
  } as unknown as NeedsYouItem;
  log.commit([eventEntry(marked(21)), eventEntry({ scope: INSTALLATION_SCOPE, occurredAt: AT, record: { type: 'inbox-item-changed', item } })]);
  await publish();
  const frame = await stream.next();
  assert.equal(frame?.event, 'inbox-item-changed');
  assert.equal(checkHttpSchema('InstallationEvent', frame?.data).ok, true);
  assert.deepEqual(frame?.data?.item, {
    itemId: 'item-installation', sourceId: 'reconciliation', kind: 'reconciliation', subject: item.subject, title: item.title, createdAt: AT,
    answerableBy: 'installation-owner', status: { state: 'open' }, reconciliationReason: 'unrecorded-process', containment: 'contained', processCount: 2,
  });
});

test('a change of the reader\'s role in the project ends its stream with stream-ended, and a reconnect is authorized anew', async () => {
  const vince = await browser('vince');
  const stream = await open('/projects/alpha/events', vince);
  value(await administration.assignProjectRole(owner, { projectId: ALPHA, loginName: 'vince', role: 'project-operator' }, INVOCATION));
  await publish();
  assert.deepEqual(await stream.next(), { event: 'stream-ended', data: { type: 'stream-ended', reason: 'role-changed' } });
  assert.equal(await stream.next(), undefined);
  value(await administration.removeProjectMember(owner, { projectId: ALPHA, principalId: principals.get('vince')! }, INVOCATION));
  assert.equal(await refusal('/projects/alpha/events', vince), 403);
});

test('a logout ends the browser\'s streams without a frame, and a bearer stream goes on', async () => {
  const vera = await browser('vera');
  const browserStream = await open('/projects/alpha/events', vera);
  const bearerStream = await open('/projects/alpha/events', BEARER);
  const loggedOut = await fetch(`${base}/session`, { method: 'DELETE', headers: vera });
  assert.equal(loggedOut.status, 204);
  log.commit([eventEntry(marked(31))]);
  await publish();
  assert.equal(await browserStream.next(), undefined);
  assert.equal((await bearerStream.next())?.data?.workersOnline, 31);
});

test('a stream whose unsent bytes pass the buffer bound is dropped, and an event that breaks its schema is never sent', async () => {
  const response = new FakeResponse();
  const streams = new EventStreamApi(events);
  const answer = value(await streams.streamProjectEvents(request('alpha')));
  answer.start(response as unknown as ServerResponse);
  log.commit([eventEntry({ scope: projectScope(ALPHA), occurredAt: AT, record: { type: 'card-changed', card: {} as never } }), eventEntry(marked(41))]);
  await publish();
  await response.wrote(1);
  assert.match(response.written[0]!, /"workersOnline":41/);
  assert.ok(logs.records.some((record) => record.event === 'events.stream.invalid-event'));
  const frames = Math.ceil(MAX_STREAM_BUFFER_BYTES / response.written[0]!.length) + 1;
  log.commit(Array.from({ length: frames }, (_, index) => eventEntry(marked(index))));
  await publish();
  await response.closed;
  assert.deepEqual([response.destroyed, response.ended], [true, false]);
});

function request(projectId: string): ApiRequest {
  return { parameters: [projectId], body: undefined, query: new URLSearchParams(), correlationId: 'c-1' as CorrelationId, principalId: owner };
}

// A response that never sends: what is written stays buffered.
class FakeResponse extends EventEmitter {
  readonly written: string[] = [];
  writableLength = 0;
  destroyed = false;
  ended = false;
  readonly #waiters: Array<{ count: number; resolve: () => void }> = [];
  #close!: () => void;
  readonly closed = new Promise<void>((resolve) => { this.#close = resolve; });

  write(text: string): boolean {
    this.written.push(text);
    this.writableLength += Buffer.byteLength(text);
    for (const waiter of this.#waiters.filter((candidate) => candidate.count <= this.written.length)) waiter.resolve();
    return false;
  }

  wrote(count: number): Promise<void> {
    if (this.written.length >= count) return Promise.resolve();
    return new Promise((resolve) => this.#waiters.push({ count, resolve }));
  }

  destroy(): void {
    this.destroyed = true;
    this.#close();
  }

  end(): void {
    this.ended = true;
    this.#close();
  }
}

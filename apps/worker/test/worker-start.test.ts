import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { SUPPORTED_PROTOCOL_VERSIONS, checkMessageSchema } from '@taskelith/contracts';
import type { JournalSnapshot } from '@taskelith/execution';
import { stubAdmissionCheck, type Enrollment, type EnrollmentClient, type EnrollmentRequest, type SelfCheckRun, type WorkerAdmissionCheck } from '@taskelith/fleet';
import { err, failure, ok, parseInstant, type Result } from '@taskelith/kernel';
import type { TransportConnection, WorkerTransportEndpoint } from '@taskelith/nats';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { failed, id, value } from '@taskelith/testing';
import {
  launchFailureLine,
  serveUntilStopped,
  startWorker,
  workerMain,
  type LaunchHost,
  type LaunchingDependencies,
  type LaunchSettings,
  type RunningWorker,
  type ServiceProcess,
  type WorkerDependencies,
  type WorkerSettings,
} from '@taskelith/worker';
import { ManualTimers, StatusStream } from './contact-fakes.ts';
import { FakeAuthority, FakeClock, FakeDaemon, FakeSupervisions, grantFor, offer, requestOf } from './launch-fakes.ts';
import {
  failureReason,
  hostBootId,
  recordJournalFault,
  workerPaths,
  type VolumeProbe,
  type VolumeSpace,
} from '@taskelith/worker-journal';

const T0 = value(parseInstant('2026-10-25T09:00:00.000Z'));
const AN_HOUR_LATER = value(parseInstant('2026-10-25T10:00:00.000Z'));
const TEST_VOLUME: VolumeProbe = () => ({ ok: true, value: { platform: 'darwin', filesystem: 'apfs', local: true } });
const GIBIBYTE = 2 ** 30;
const AMPLE_SPACE: VolumeSpace = { availableBytes: 50 * GIBIBYTE, totalBytes: 100 * GIBIBYTE };
const LAUNCH: LaunchSettings = { command: { executable: '/bin/true', arguments: [] } };
const TOKEN = `tken_${'T'.repeat(43)}`;
const ENROLLMENT: Enrollment = {
  installationId: 'a'.repeat(32), workerId: id('WorkerId', `w${'b'.repeat(32)}`), credentialGeneration: 1, recoveryEpoch: 1 as Enrollment['recoveryEpoch'],
  protocolVersions: { minimum: 1, maximum: 1 }, credentials: { controlPlane: `tkwk_${'C'.repeat(43)}`, broker: 'broker creds text' },
};

class FakeEnrollment implements EnrollmentClient {
  readonly calls: Array<{ token: string; request: EnrollmentRequest }> = [];
  answer: Result<Enrollment> = ok(ENROLLMENT);

  async enroll(token: string, request: EnrollmentRequest): Promise<Result<Enrollment>> {
    this.calls.push({ token, request });
    return this.answer;
  }
}

// A broker that stores publications; it has no consumers, so the command
// consumer keeps retrying its lookup until the worker stops.
class FakeBroker {
  readonly endpoints: WorkerTransportEndpoint[] = [];
  readonly published: Array<{ subject: string; messageId: string | undefined; body: Record<string, unknown> }> = [];
  // Core NATS publications, outside any stream.
  readonly core: Array<{ subject: string; body: Record<string, unknown> }> = [];
  // The status events of each connection, in connection order.
  readonly statuses: StatusStream[] = [];
  closed = 0;
  answer: Result<void> = ok(undefined);

  connect = async (endpoint: WorkerTransportEndpoint): Promise<Result<TransportConnection>> => {
    this.endpoints.push(endpoint);
    if (!this.answer.ok) return this.answer;
    const statuses = new StatusStream();
    this.statuses.push(statuses);
    const connection = {
      status: () => statuses,
      publish: (subject: string, data: Uint8Array) => {
        this.core.push({ subject, body: JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown> });
      },
    } as unknown as TransportConnection['connection'];
    const js = {
      consumers: { get: async () => Promise.reject(new Error('no consumer')) },
      publish: async (subject: string, data: Uint8Array, options: { msgID?: string }) => {
        this.published.push({ subject, messageId: options.msgID, body: JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown> });
        return { duplicate: false };
      },
    } as unknown as TransportConnection['js'];
    return ok({ connection, js, close: async () => {
      this.closed += 1;
      statuses.end();
    } });
  };

  async publications(count: number): Promise<FakeBroker['published']> {
    for (let wait = 0; this.published.length < count && wait < 100; wait += 1) await delay(20);
    return this.published;
  }

  // The bodies published on the observation subject with that type.
  ofType(type: string): Array<Record<string, unknown>> {
    return this.published.map(({ body }) => body).filter((body) => typeOf(body) === type);
  }
}

function typeOf(body: Record<string, unknown>): unknown {
  return body.messageType ?? (body.metadata as Record<string, unknown> | undefined)?.observationType;
}

let base: string;
let settings: WorkerSettings;
let enrollment: FakeEnrollment;
let broker: FakeBroker;
let timers: ManualTimers;
let space: VolumeSpace;
let daemon: FakeDaemon;
let admissionChecks: WorkerAdmissionCheck[];
const running: RunningWorker[] = [];

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'taskelith-worker-')));
  settings = {
    dataRoot: join(base, 'data'), controlPlaneUrl: new URL('https://control-plane/'), natsUrl: new URL('nats://broker:4222'),
    host: { platform: 'linux', architecture: 'x64', hostname: 'build-1' },
    capacity: { slots: 2, cpuMillicores: 4000, memoryMebibytes: 7680, controls: [] },
    enrollmentToken: TOKEN,
  };
  enrollment = new FakeEnrollment();
  broker = new FakeBroker();
  timers = new ManualTimers();
  space = AMPLE_SPACE;
  daemon = new FakeDaemon();
  admissionChecks = [stubAdmissionCheck()];
});

afterEach(async () => {
  for (const worker of running.splice(0)) await worker.stop();
  rmSync(base, { recursive: true, force: true });
});

function dependencies(launching?: LaunchingDependencies): WorkerDependencies {
  return {
    enrollment, connect: broker.connect, newJournalId: () => 'c'.repeat(32), clock: { now: () => T0 },
    sleep: timers.sleep, draw: () => 0, probe: TEST_VOLUME, space: () => ok(space), daemon, pressurePollMilliseconds: 10,
    admissionChecks, ...(launching === undefined ? {} : { launching }),
  };
}

// Launch dependencies that record what the worker asked of them.
class RecordingLaunching {
  readonly credentials: string[] = [];
  readonly hosts: Array<{ launch: LaunchSettings | undefined; executions: string }> = [];
  readonly authority = new FakeAuthority();
  hostAnswer: Result<LaunchHost> = ok({ clock: new FakeClock(), supervision: new FakeSupervisions().factory });

  readonly dependencies: LaunchingDependencies = {
    authority: (credential) => {
      this.credentials.push(credential);
      return this.authority;
    },
    host: (hostSettings, executions) => {
      this.hosts.push({ launch: hostSettings.launch, executions });
      return this.hostAnswer;
    },
    sleep: (milliseconds, signal) => delay(milliseconds, undefined, { signal }).catch(() => undefined),
    draw: () => 0,
    newId: randomUUID,
    pollMilliseconds: 10,
  };
}

async function start(chosen: WorkerSettings = settings, launching?: LaunchingDependencies): Promise<RunningWorker> {
  const worker = value(await startWorker(chosen, dependencies(launching)));
  running.push(worker);
  return worker;
}

test('the first start enrolls with the token, stores the credentials, and connects with them', async () => {
  const worker = await start();
  assert.deepEqual(enrollment.calls, [{
    token: TOKEN,
    request: { journalId: 'c'.repeat(32), host: settings.host, protocolVersions: SUPPORTED_PROTOCOL_VERSIONS, capacity: settings.capacity },
  }]);
  assert.deepEqual([worker.identity.installationId, worker.identity.workerId, worker.identity.journalId], [ENROLLMENT.installationId, ENROLLMENT.workerId, 'c'.repeat(32)]);
  const paths = workerPaths(settings.dataRoot);
  assert.equal(readFileSync(join(paths.worker, worker.identity.credentials.broker), 'utf8'), ENROLLMENT.credentials.broker);
  assert.equal(readFileSync(join(paths.worker, worker.identity.credentials.controlPlane), 'utf8'), ENROLLMENT.credentials.controlPlane);
  const [endpoint] = broker.endpoints;
  assert.deepEqual([endpoint?.server.href, endpoint?.creds, endpoint?.workerId, endpoint?.address.installationId, endpoint?.tls],
    ['nats://broker:4222', ENROLLMENT.credentials.broker, ENROLLMENT.workerId, ENROLLMENT.installationId, undefined]);
});

test('the worker declares its capacity once per change and publishes it on its observation subject', async () => {
  const first = await start();
  await until(() => broker.ofType('worker.capacity.declared').length > 0);
  const declared = broker.published.find(({ body }) => typeOf(body) === 'worker.capacity.declared');
  assert.equal(declared?.subject, `taskelith.${ENROLLMENT.installationId}.workers.${ENROLLMENT.workerId}.observations`);
  assert.equal(checkMessageSchema('CapacityDeclaredObservation', declared?.body).ok, true);
  assert.deepEqual(declared?.body.payload, {
    capacity: { slots: 2, cpuMillicores: 4000, memoryMebibytes: 7680, enforceableControls: [] }, protocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
  });
  await first.stop();
  // Past the republication bound, every unconfirmed entry is due again.
  const outbox = (worker: RunningWorker) => value(worker.root.journal.dueForPublication(AN_HOUR_LATER))
    .map((entry) => entry.fact.kind).filter((kind) => kind === 'capacity-declared');
  const second = await start();
  assert.deepEqual(outbox(second), ['capacity-declared']);
  await second.stop();
  const third = await start({ ...settings, capacity: { ...settings.capacity, slots: 3 } });
  assert.deepEqual(outbox(third), ['capacity-declared', 'capacity-declared']);
});

function pressureFacts(worker: RunningWorker): unknown[] {
  return value(worker.root.journal.dueForPublication(AN_HOUR_LATER))
    .flatMap(({ fact }) => (fact.kind === 'admission-pressure-changed' ? [fact.causes] : []));
}

test('each start reports its admission pressure once, and a clear one too', async () => {
  const first = await start();
  await until(() => broker.ofType('worker.admission-pressure.changed').length === 1);
  const [reported] = broker.ofType('worker.admission-pressure.changed');
  assert.equal(checkMessageSchema('AdmissionPressureChangedObservation', reported).ok, true);
  assert.deepEqual(reported?.payload, { causes: [] });
  assert.deepEqual(pressureFacts(first), [[]]);
  await first.stop();
  assert.deepEqual(pressureFacts(await start()), [[], []]);
});

// A containment check that counts its runs and the connections before them.
function countingCheck(run: SelfCheckRun = { outcome: 'passed' }): WorkerAdmissionCheck & { connectionsAtRun: number[] } {
  const connectionsAtRun: number[] = [];
  return { ...stubAdmissionCheck(run), connectionsAtRun, run: async () => {
    connectionsAtRun.push(broker.endpoints.length);
    return run;
  } };
}

function selfCheckFacts(worker: RunningWorker): unknown[] {
  return value(worker.root.journal.dueForPublication(AN_HOUR_LATER))
    .flatMap(({ fact }) => (fact.kind === 'self-check-reported' ? [fact.results] : []));
}

test('each start reports its self-check once, after its capacity and pressure', async () => {
  const first = await start();
  await until(() => broker.ofType('worker.self-check.reported').length === 1);
  const [reported] = broker.ofType('worker.self-check.reported');
  assert.equal(checkMessageSchema('SelfCheckReportedObservation', reported).ok, true);
  assert.deepEqual(reported?.payload, { results: [{ checkId: 'linux-containment', outcome: 'not-applicable', details: ['no-launch-command'] }] });
  const kinds = value(first.root.journal.dueForPublication(AN_HOUR_LATER)).map(({ fact }) => fact.kind);
  assert.deepEqual(kinds, ['capacity-declared', 'admission-pressure-changed', 'self-check-reported']);
  await first.stop();
  assert.equal(selfCheckFacts(await start()).length, 2);
});

test('a Linux worker without a launch command and a macOS worker never run the containment check', async () => {
  const check = countingCheck();
  admissionChecks = [check];
  const linux = await start();
  assert.deepEqual(selfCheckFacts(linux), [[{ checkId: 'linux-containment', outcome: 'not-applicable', details: ['no-launch-command'] }]]);
  await linux.stop();
  const macos = await start({ ...settings, host: { ...settings.host, platform: 'darwin' }, launch: LAUNCH });
  assert.deepEqual(selfCheckFacts(macos)[1], [{ checkId: 'linux-containment', outcome: 'not-applicable', details: ['platform-not-covered'] }]);
  assert.deepEqual(check.connectionsAtRun, []);
});

test('a launching Linux worker runs the check before it connects, and a pass is reported', async () => {
  const check = countingCheck();
  admissionChecks = [check];
  const worker = await start({ ...settings, launch: LAUNCH }, new RecordingLaunching().dependencies);
  assert.deepEqual(check.connectionsAtRun, [0]);
  assert.deepEqual(selfCheckFacts(worker), [[{ checkId: 'linux-containment', outcome: 'passed', details: [] }]]);
});

test('a failed self-check still starts the worker, reports the failure, and never authorizes a launch', async () => {
  admissionChecks = [countingCheck({ outcome: 'failed', problems: ['cgroup v2 is not mounted'] })];
  const launching = new RecordingLaunching();
  const worker = await start({ ...settings, launch: LAUNCH }, launching.dependencies);
  assert.deepEqual(selfCheckFacts(worker), [[{ checkId: 'linux-containment', outcome: 'failed', details: ['cgroup v2 is not mounted'] }]]);
  await until(() => broker.ofType('worker.self-check.reported').length === 1);
  value(worker.root.journal.recordCommand(offer()));
  await delay((launching.dependencies.pollMilliseconds ?? 0) * 10);
  assert.deepEqual([launching.credentials, launching.authority.requests], [[], []]);
});

test('below the disk floor the worker reports pressure and truncates only its buffered logs', async () => {
  const paths = workerPaths(settings.dataRoot);
  await (await start()).stop();
  mkdirSync(join(paths.logs, 'stream'), { recursive: true });
  writeFileSync(join(paths.logs, 'stream', 'attempt-1.log'), 'buffered output');
  space = { availableBytes: 4 * GIBIBYTE, totalBytes: 100 * GIBIBYTE };
  const worker = await start();
  assert.deepEqual(pressureFacts(worker).at(-1), ['disk-floor']);
  assert.equal(readFileSync(join(paths.logs, 'stream', 'attempt-1.log'), 'utf8'), '');
  assert.equal(existsSync(paths.journal), true);
});

test('the pressure watch reports a change while nothing else asks', async () => {
  const worker = await start();
  space = { availableBytes: 0, totalBytes: 100 * GIBIBYTE };
  for (let wait = 0; pressureFacts(worker).length < 2 && wait < 100; wait += 1) await delay(10);
  assert.deepEqual(pressureFacts(worker), [[], ['disk-floor']]);
  space = AMPLE_SPACE;
  for (let wait = 0; pressureFacts(worker).length < 3 && wait < 100; wait += 1) await delay(10);
  assert.deepEqual(pressureFacts(worker), [[], ['disk-floor'], []]);
});

test('the daemon overhead is reported until it subsides, and its sensor runs until the stop', async () => {
  const worker = await start();
  assert.equal(daemon.watches, 1);
  daemon.resident = ok(2 ** 40);
  daemon.lag = ok(250);
  for (let wait = 0; pressureFacts(worker).length < 2 && wait < 100; wait += 1) await delay(10);
  assert.deepEqual(pressureFacts(worker), [[], ['daemon-memory', 'event-loop-lag']]);
  daemon.resident = ok(0);
  daemon.lag = ok(0);
  for (let wait = 0; pressureFacts(worker).length < 3 && wait < 100; wait += 1) await delay(10);
  assert.deepEqual(pressureFacts(worker), [[], ['daemon-memory', 'event-loop-lag'], []]);
  await worker.stop();
});

test('the worker listens on no port: every connection is outbound', async () => {
  await start();
  assert.equal(process.getActiveResourcesInfo().includes('TCPServerWrap'), false);
});

test('a later start reuses the enrolled identity and never redeems a token again', async () => {
  const first = await start();
  await first.stop();
  const second = await start({ ...settings, natsTls: { ca: 'PEM' } });
  assert.equal(enrollment.calls.length, 1);
  assert.deepEqual(second.identity, first.identity);
  assert.deepEqual(broker.endpoints[1]?.tls, { ca: 'PEM' });
  const { enrollmentToken: _token, ...withoutToken } = settings;
  await second.stop();
  assert.equal((await start(withoutToken)).identity.workerId, ENROLLMENT.workerId);
});

test('an unenrolled worker without a token, or with a refused token, creates nothing', async () => {
  const { enrollmentToken: _token, ...withoutToken } = settings;
  const missing = failed(await startWorker(withoutToken, dependencies()));
  assert.deepEqual([missing.code, missing.details.reason, missing.details.variable], ['not-found', 'not-enrolled', 'TASKELITH_ENROLLMENT_TOKEN']);
  enrollment.answer = err(failure('forbidden', 'enrollWorker answered 401', { reason: 'token-invalid' }));
  assert.equal(failed(await startWorker(settings, dependencies())).details.reason, 'token-invalid');
  enrollment.answer = ok({ ...ENROLLMENT, installationId: 'not.valid' });
  assert.equal(failed(await startWorker(settings, dependencies())).code, 'invalid');
  assert.equal(existsSync(workerPaths(settings.dataRoot).worker), false);
  assert.equal(broker.endpoints.length, 0);
});

test('a root that cannot be created never spends the token', async () => {
  const unsupported: VolumeProbe = () => ({ ok: true, value: { platform: 'darwin', filesystem: 'hfs', local: true } });
  const refused = failed(await startWorker(settings, { ...dependencies(), probe: unsupported }));
  assert.equal(failureReason(refused), 'unsupported-volume');
  const paths = workerPaths(settings.dataRoot);
  mkdirSync(paths.worker, { recursive: true, mode: 0o700 });
  assert.equal(failed(await startWorker(settings, dependencies())).code, 'conflict');
  assert.equal(existsSync(paths.identity) || existsSync(paths.journalDirectory), false);
  assert.equal(enrollment.calls.length, 0);
});

test('an error thrown during enrollment abandons the claim', async () => {
  enrollment.enroll = async () => {
    throw new Error('adapter defect');
  };
  await assert.rejects(startWorker(settings, dependencies()), /adapter defect/);
  assert.equal(existsSync(workerPaths(settings.dataRoot).worker), false);
  enrollment = new FakeEnrollment();
  await start();
});

test('a journal fault stops the start before any request or connection', async () => {
  const first = await start();
  await first.stop();
  const bootId = value(hostBootId());
  const paths = workerPaths(settings.dataRoot);
  value(recordJournalFault(paths.fault, failure('unavailable', 'flush failed', { reason: 'flush-failure' }), bootId));
  assert.equal(failureReason(failed(await startWorker(settings, dependencies()))), 'flush-failure');
  assert.equal(enrollment.calls.length, 1);
  assert.equal(broker.endpoints.length, 1);
});

test('a broker that cannot be reached at the start leaves the worker running offline until it connects', async () => {
  broker.answer = err(failure('unavailable', 'connect failed'));
  const worker = await start();
  await until(() => timers.waiting.includes(5_000));
  assert.deepEqual([broker.endpoints.length, broker.published, broker.core], [1, [], []]);
  broker.answer = ok(undefined);
  timers.elapse(5_000);
  await until(() => broker.ofType('worker.inventory.reported').length > 0 && broker.core.length > 0);
  assert.equal(broker.endpoints.length, 2);
  await worker.stop();
  assert.equal(broker.closed, 1);
});

test('each connection reports the inventory unsolicited and sends heartbeats on the heartbeat subject', async () => {
  const worker = await start();
  await until(() => broker.ofType('worker.inventory.reported').length === 1 && broker.core.length === 1);
  const [report] = broker.ofType('worker.inventory.reported');
  assert.equal(checkMessageSchema('InventoryReported', report).ok, true);
  assert.equal(report?.requestId, undefined);
  const [heartbeat] = broker.core;
  assert.equal(heartbeat?.subject, `taskelith.${ENROLLMENT.installationId}.workers.${ENROLLMENT.workerId}.heartbeats`);
  assert.equal(checkMessageSchema('WorkerHeartbeat', heartbeat?.body).ok, true);
  assert.deepEqual([heartbeat?.body.workerId, heartbeat?.body.journalId], [worker.identity.workerId, worker.identity.journalId]);
  broker.statuses[0]?.push('disconnect');
  broker.statuses[0]?.push('reconnect');
  await until(() => broker.ofType('worker.inventory.reported').length === 2 && broker.core.length === 2);
  assert.deepEqual(timers.waiting, [10_000]);
});

// The fault a flush failure leaves on the journal (contract section 7).
function stopJournal(worker: RunningWorker): void {
  const fault = failure('unavailable', 'journal I/O error', { reason: 'flush-failure' });
  Object.defineProperty(worker.root.journal, 'fault', { value: fault });
}

test('a journal stopped after the connection sends no heartbeat or inventory, at an interval or a reconnect', async () => {
  const worker = await start();
  await until(() => broker.core.length === 1 && timers.waiting.includes(10_000));
  stopJournal(worker);
  timers.elapse(10_000);
  broker.statuses[0]?.push('disconnect');
  broker.statuses[0]?.push('reconnect');
  await until(() => timers.waiting.includes(5_000) && timers.waiting.includes(10_000));
  timers.elapse(10_000);
  await until(() => timers.waiting.includes(10_000));
  assert.deepEqual([broker.core.length, broker.ofType('worker.inventory.reported').length], [1, 1]);
});

test('a runtime failure stops the launches, then closes the root, and settles stopped', async () => {
  const launchFailures: unknown[] = [];
  const launching = { ...new RecordingLaunching().dependencies, onFailure: (error: unknown) => launchFailures.push(error) };
  const failing = { ...dependencies(launching), connect: async (endpoint: WorkerTransportEndpoint) => {
    const connected = await broker.connect(endpoint);
    return connected.ok ? ok({ ...connected.value, close: async () => Promise.reject(new Error('close failed')) }) : connected;
  } };
  const worker = value(await startWorker({ ...settings, launch: LAUNCH }, failing));
  const host: ServiceProcess = { on: () => undefined, off: () => undefined };
  const lines: string[] = [];
  const served = serveUntilStopped(worker, host, (line) => lines.push(line));
  await until(() => broker.statuses.length === 1);
  broker.statuses[0]?.end();
  await served;
  assert.equal(host.exitCode, 1);
  assert.match(lines.join('\n'), /stopping the worker failed: Error: close failed/);
  assert.deepEqual(launchFailures, []);
  await assert.rejects(worker.stop(), /close failed/);
  assert.equal((await start()).identity.workerId, ENROLLMENT.workerId);
});

test('stop closes the connection and the root once, and a signal stops a served worker', async () => {
  const worker = await start();
  const listeners = new Map<string, () => void>();
  const host: ServiceProcess = {
    on: (signal, listener) => listeners.set(signal, listener),
    off: (signal) => listeners.delete(signal),
  };
  const served = serveUntilStopped(worker, host, () => assert.fail('a clean stop writes nothing'));
  listeners.get('SIGTERM')?.();
  await served;
  await worker.stop();
  assert.equal(broker.closed, 1);
  assert.equal(listeners.size, 0);
  assert.equal((await start()).identity.workerId, ENROLLMENT.workerId);
});

test('a close that fails still stops a served worker without a rejection', async () => {
  const failing = { ...dependencies(), connect: async (endpoint: WorkerTransportEndpoint) => {
    const connected = await broker.connect(endpoint);
    return connected.ok ? ok({ ...connected.value, close: async () => Promise.reject(new Error('close failed')) }) : connected;
  } };
  const worker = value(await startWorker(settings, failing));
  const listeners = new Map<string, () => void>();
  const host: ServiceProcess = { on: (signal, listener) => listeners.set(signal, listener), off: () => undefined };
  const lines: string[] = [];
  const served = serveUntilStopped(worker, host, (line) => lines.push(line));
  await until(() => broker.core.length === 1);
  listeners.get('SIGINT')?.();
  listeners.get('SIGTERM')?.();
  await served;
  assert.equal(host.exitCode, 1);
  assert.match(lines.join('\n'), /stopping the worker failed: Error: close failed/);
  assert.equal(lines.length, 1);
  await assert.rejects(worker.stop(), /close failed/);
  assert.equal((await start()).identity.workerId, ENROLLMENT.workerId);
});

test('the entry reports a start failure redacted and returns nothing', async () => {
  const lines: string[] = [];
  const environment = { TASKELITH_DATA_DIR: settings.dataRoot, TASKELITH_CONTROL_PLANE_URL: 'https://control-plane/', TASKELITH_NATS_URL: 'nats://broker:4222' };
  assert.equal(await workerMain(environment, (line) => lines.push(line), () => dependencies()), undefined);
  assert.equal(JSON.parse(lines[0] ?? '{}').error.details.reason, 'not-enrolled');
  const worker = await workerMain({ ...environment, TASKELITH_ENROLLMENT_TOKEN: TOKEN }, (line) => lines.push(line), () => dependencies());
  assert.ok(worker);
  running.push(worker);
  assert.equal(lines.length, 1);
});

async function until(condition: () => boolean): Promise<void> {
  for (let wait = 0; !condition() && wait < 200; wait += 1) await delay(10);
  assert.ok(condition(), 'the condition never held');
}

test('a worker without a launch command accepts an assignment and never launches it', async () => {
  const launching = new RecordingLaunching();
  const worker = await start(settings, launching.dependencies);
  value(worker.root.journal.recordCommand(offer()));
  // Several poll intervals pass: a running orchestrator would have asked.
  await delay((launching.dependencies.pollMilliseconds ?? 0) * 10);
  assert.deepEqual([launching.credentials, launching.authority.requests], [[], []]);
  assert.equal(value(worker.root.journal.snapshot()).intents.length, 1);
  assert.deepEqual(value(worker.root.journal.snapshot()).executions, []);
});

test('with a launch command, an accepted assignment is authorized with the stored credential', async () => {
  const launching = new RecordingLaunching();
  launching.authority.answers = [ok({ kind: 'rejected', rejection: { reason: 'gate-not-passed', retryable: false, message: 'gate' } })];
  const worker = await start({ ...settings, launch: LAUNCH }, launching.dependencies);
  value(worker.root.journal.recordCommand(offer()));
  await until(() => launching.authority.requests.length > 0);
  assert.deepEqual(launching.credentials, [ENROLLMENT.credentials.controlPlane]);
  assert.deepEqual(launching.hosts, [{ launch: LAUNCH, executions: workerPaths(settings.dataRoot).executions }]);
  assert.equal(launching.authority.requests[0]?.assignmentId, 'assignment-1');
  await until(() => value(worker.root.journal.snapshot()).executions[0]?.authorizations[0]?.outcome === 'rejected-final');
  await worker.stop();
});

test('a launching worker begins no authorization before its first broker connection', async () => {
  broker.answer = err(failure('unavailable', 'connect failed'));
  const launching = new RecordingLaunching();
  launching.authority.answers = [ok({ kind: 'rejected', rejection: { reason: 'gate-not-passed', retryable: false, message: 'gate' } })];
  const worker = await start({ ...settings, launch: LAUNCH }, launching.dependencies);
  value(worker.root.journal.recordCommand(offer()));
  await delay((launching.dependencies.pollMilliseconds ?? 0) * 10);
  assert.deepEqual([launching.authority.requests, value(worker.root.journal.snapshot()).executions], [[], []]);
  broker.answer = ok(undefined);
  timers.elapse(5_000);
  await until(() => launching.authority.requests.length > 0);
});

test('a composition of more than eight checks fails the start before enrollment', async () => {
  admissionChecks = Array.from({ length: 9 }, (_, index) => ({ ...stubAdmissionCheck(), checkId: `check-${index}` }));
  const started = await startWorker(settings, dependencies());
  assert.equal(failed(started).code, 'invalid');
  assert.deepEqual([enrollment.calls, broker.endpoints], [[], []]);
});

test('a launch host that cannot be built fails the start', async () => {
  const launching = new RecordingLaunching();
  launching.hostAnswer = err(failure('unavailable', 'no supervisor platform'));
  const started = await startWorker({ ...settings, launch: LAUNCH }, dependencies(launching.dependencies));
  assert.equal(failed(started).code, 'unavailable');
});

test('a launch failure line keeps a failure\'s code and redacts secrets', () => {
  const secret = `tkwk_${'S'.repeat(43)}`;
  const failureLine = JSON.parse(launchFailureLine(failure('unavailable', `the record is gone ${secret}`)));
  assert.equal(failureLine.error.code, 'unavailable');
  assert.equal(JSON.stringify(failureLine).includes(secret), false);
  const errorLine = JSON.parse(launchFailureLine(new Error(`broken ${secret}`)));
  assert.equal(errorLine.error.code, 'internal');
  assert.ok(errorLine.error.message.startsWith('a launch failed: broken'));
  assert.equal(JSON.stringify(errorLine).includes(secret), false);
  assert.equal(JSON.parse(launchFailureLine('plain')).error.message, 'a launch failed: plain');
});

test('a launch failure line uses an object\'s message, and falls back on what it cannot render', () => {
  assert.equal(JSON.parse(launchFailureLine({ message: 'the journal is closed' })).error.message, 'a launch failed: the journal is closed');
  const unknownCode = JSON.parse(launchFailureLine({ code: 'exploded', message: 'm', details: {} }));
  assert.deepEqual(unknownCode.error, { code: 'internal', message: 'a launch failed: m' });
  const badDetails = JSON.parse(launchFailureLine({ code: 'internal', message: 'm', details: { count: 3 } }));
  assert.deepEqual(badDetails.error, { code: 'internal', message: 'a launch failed: m' });
  const unprintable = { toString: () => { throw new Error('no text'); } };
  assert.deepEqual(JSON.parse(launchFailureLine(unprintable)).error, { code: 'internal', message: 'a launch failed' });
});

test('the host\'s record listing and the logger reach the start reconciliation', async () => {
  const launching = new RecordingLaunching();
  const sink = new InMemoryLogSink();
  launching.hostAnswer = ok({ clock: new FakeClock(), supervision: new FakeSupervisions().factory, records: async () => ok(['stray-1']) });
  const dependencies = { ...launching.dependencies, logger: new Logger(sink, { now: () => T0 }) };
  await start({ ...settings, launch: LAUNCH }, dependencies);
  await until(() => sink.records.some(({ event }) => event === 'worker.execution.leftover'));
  assert.deepEqual(sink.records.find(({ event }) => event === 'worker.execution.leftover')?.fields, { record: 'stray-1' });
});

// What an earlier process left: execution 1 pending its grant, 2 granted
// with its record written, and 3 closed as not started.
async function inheritExecutions(): Promise<JournalSnapshot['executions']> {
  const earlier = await start();
  const { journal } = earlier.root;
  for (const number of [1, 2, 3]) {
    value(journal.recordCommand(offer(number)));
    value(journal.beginAuthorization(requestOf(`execution-${number}`, `operation-${number}`, number)));
  }
  value(journal.recordGrant(grantFor(requestOf('execution-2', 'operation-2', 2))));
  value(journal.recordExecutionRecordWritten(id('ExecutionId', 'execution-2')));
  value(journal.recordNotStarted(id('ExecutionId', 'execution-3')));
  const { executions } = value(journal.snapshot());
  await earlier.stop();
  return executions;
}

async function startLogged(launching: RecordingLaunching): Promise<{ worker: RunningWorker; sink: InMemoryLogSink }> {
  const sink = new InMemoryLogSink();
  const logger = new Logger(sink, { now: () => T0 });
  const worker = value(await startWorker(settings, { ...dependencies(launching.dependencies), logger }));
  running.push(worker);
  return { worker, sink };
}

test('without a launch command, inherited executions are reconciled and none is launched', async () => {
  await inheritExecutions();
  const launching = new RecordingLaunching();
  const { worker, sink } = await startLogged(launching);
  await until(() => value(worker.root.journal.snapshot()).executions.every(({ state }) => state === 'not-started'));
  assert.deepEqual(launching.hosts, [{ launch: undefined, executions: workerPaths(settings.dataRoot).executions }]);
  assert.deepEqual([launching.credentials, launching.authority.requests], [[], []]);
  assert.deepEqual(sink.records.filter(({ event }) => event === 'worker.reconciliation.deferred'), []);
});

test('without a launch command, the start reconciliation reports unrecorded processes', async () => {
  const launching = new RecordingLaunching();
  const containment = '/sys/fs/cgroup/taskelith/lost-1';
  launching.hostAnswer = ok({
    clock: new FakeClock(), supervision: new FakeSupervisions().factory, records: async () => ok([]),
    containments: () => ok([{ name: 'lost-1', containment, processes: [] }]),
  });
  const { worker } = await startLogged(launching);
  const unrecorded = () => value(worker.root.journal.dueForPublication(T0)).map(({ fact }) => fact)
    .filter((fact) => fact.kind === 'unrecorded-process');
  await until(() => unrecorded().length > 0);
  const { recoveryEpoch } = worker.root.journal.binding;
  assert.deepEqual(unrecorded(), [{ kind: 'unrecorded-process', containment, recoveryEpoch, processes: [] }]);
  assert.deepEqual(launching.hosts.map(({ launch }) => launch), [undefined]);
});

test('without a supervision host, each inherited open execution is deferred and left untouched', async () => {
  const before = await inheritExecutions();
  const launching = new RecordingLaunching();
  launching.hostAnswer = err(failure('invalid', 'Linux needs a containment parent'));
  const { worker, sink } = await startLogged(launching);
  await delay((launching.dependencies.pollMilliseconds ?? 0) * 10);
  const deferred = sink.records.filter(({ event }) => event === 'worker.reconciliation.deferred');
  assert.deepEqual(deferred.map(({ fields }) => fields), [
    { executionId: 'execution-1', reason: 'Linux needs a containment parent' },
    { executionId: 'execution-2', reason: 'Linux needs a containment parent' },
  ]);
  assert.deepEqual(launching.authority.requests, []);
  assert.deepEqual(value(worker.root.journal.snapshot()).executions, before);
});

test('without launch dependencies, each inherited open execution is deferred', async () => {
  await inheritExecutions();
  const sink = new InMemoryLogSink();
  running.push(value(await startWorker(settings, { ...dependencies(), logger: new Logger(sink, { now: () => T0 }) })));
  const reasons = sink.records.filter(({ event }) => event === 'worker.reconciliation.deferred').map(({ fields }) => fields.reason);
  assert.deepEqual(reasons, ['no supervision host', 'no supervision host']);
});

test('without open executions, nothing is deferred', async () => {
  const { sink } = await startLogged(new RecordingLaunching());
  assert.deepEqual(sink.records.filter(({ event }) => event === 'worker.reconciliation.deferred'), []);
});

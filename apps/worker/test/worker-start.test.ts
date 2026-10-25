import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { SUPPORTED_PROTOCOL_VERSIONS, checkMessageSchema } from '@taskelith/contracts';
import type { Enrollment, EnrollmentClient, EnrollmentRequest } from '@taskelith/fleet';
import { err, failure, ok, parseInstant, type Result } from '@taskelith/kernel';
import type { TransportConnection, WorkerTransportEndpoint } from '@taskelith/nats';
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
import { FakeAuthority, FakeClock, FakeSupervisions, offer } from './launch-fakes.ts';
import { failureReason, hostBootId, recordJournalFault, workerPaths, type VolumeProbe } from '@taskelith/worker-journal';

const T0 = value(parseInstant('2026-10-25T09:00:00.000Z'));
const AN_HOUR_LATER = value(parseInstant('2026-10-25T10:00:00.000Z'));
const TEST_VOLUME: VolumeProbe = () => ({ ok: true, value: { platform: 'darwin', filesystem: 'apfs', local: true } });
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
  closed = 0;
  answer: Result<void> = ok(undefined);

  connect = async (endpoint: WorkerTransportEndpoint): Promise<Result<TransportConnection>> => {
    this.endpoints.push(endpoint);
    if (!this.answer.ok) return this.answer;
    const js = {
      consumers: { get: async () => Promise.reject(new Error('no consumer')) },
      publish: async (subject: string, data: Uint8Array, options: { msgID?: string }) => {
        this.published.push({ subject, messageId: options.msgID, body: JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown> });
        return { duplicate: false };
      },
    } as unknown as TransportConnection['js'];
    return ok({ connection: {} as TransportConnection['connection'], js, close: async () => {
      this.closed += 1;
    } });
  };

  async publications(count: number): Promise<FakeBroker['published']> {
    for (let wait = 0; this.published.length < count && wait < 100; wait += 1) await delay(20);
    return this.published;
  }
}

let base: string;
let settings: WorkerSettings;
let enrollment: FakeEnrollment;
let broker: FakeBroker;
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
});

afterEach(async () => {
  for (const worker of running.splice(0)) await worker.stop();
  rmSync(base, { recursive: true, force: true });
});

function dependencies(launching?: LaunchingDependencies): WorkerDependencies {
  return {
    enrollment, connect: broker.connect, newJournalId: () => 'c'.repeat(32), clock: { now: () => T0 },
    probe: TEST_VOLUME, ...(launching === undefined ? {} : { launching }),
  };
}

// Launch dependencies that record what the worker asked of them.
class RecordingLaunching {
  readonly credentials: string[] = [];
  readonly hosts: Array<{ launch: LaunchSettings; executions: string }> = [];
  readonly authority = new FakeAuthority();
  hostAnswer: Result<LaunchHost> = ok({ clock: new FakeClock(), supervision: new FakeSupervisions().factory });

  readonly dependencies: LaunchingDependencies = {
    authority: (credential) => {
      this.credentials.push(credential);
      return this.authority;
    },
    host: (launch, executions) => {
      this.hosts.push({ launch, executions });
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
  const [declared] = await broker.publications(1);
  assert.equal(declared?.subject, `taskelith.${ENROLLMENT.installationId}.workers.${ENROLLMENT.workerId}.observations`);
  assert.equal(checkMessageSchema('CapacityDeclaredObservation', declared?.body).ok, true);
  assert.deepEqual(declared?.body.payload, {
    capacity: { slots: 2, cpuMillicores: 4000, memoryMebibytes: 7680, enforceableControls: [] }, protocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
  });
  await first.stop();
  // Past the republication bound, every unconfirmed entry is due again.
  const outbox = (worker: RunningWorker) => value(worker.root.journal.dueForPublication(AN_HOUR_LATER)).map((entry) => entry.fact.kind);
  const second = await start();
  assert.deepEqual(outbox(second), ['capacity-declared']);
  await second.stop();
  const third = await start({ ...settings, capacity: { ...settings.capacity, slots: 3 } });
  assert.deepEqual(outbox(third), ['capacity-declared', 'capacity-declared']);
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

test('a broker that cannot be reached fails the start and releases the root', async () => {
  broker.answer = err(failure('unavailable', 'connect failed'));
  assert.equal(failed(await startWorker(settings, dependencies())).code, 'unavailable');
  broker.answer = ok(undefined);
  await start();
  assert.equal(enrollment.calls.length, 1);
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

const LAUNCH: LaunchSettings = { command: { executable: '/bin/true', arguments: [] } };

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
  assert.deepEqual([launching.credentials, launching.hosts, launching.authority.requests], [[], [], []]);
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

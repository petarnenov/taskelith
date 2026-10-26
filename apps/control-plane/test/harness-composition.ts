import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import pg from 'pg';
import { createAccount } from '@nats-io/nkeys';
import { adminMain, startControlPlane, type AdminIo, type ControlPlaneSettings, type RunningControlPlane } from '@taskelith/control-plane';
import { ControlPlaneNamespace } from '@taskelith/control-plane-store';
import type { JournalSnapshot, Task } from '@taskelith/execution';
import { BrokerAuthority, connectSystemAccount, connectTransport, NatsBrokerCredentials, TRANSPORT_LIMITS, TransportAddress, type ControlPlaneConnection } from '@taskelith/nats';
import { SYSTEM_CLOCK } from '@taskelith/node-observability';
import { InMemoryLogSink } from '@taskelith/observability';
import { PostgresDatabase } from '@taskelith/postgres';
import { parseWorkflowDefinition, type TaskId } from '@taskelith/sdlc';
import { CRASH_POINT_VARIABLE, crashEnvironment, integrationEndpoint, integrationSecret, ScenarioProcess, SEED_VARIABLE, value } from '@taskelith/testing';
import { openWorkerRoot } from '@taskelith/worker-journal';
import { CRASH_TRACE_VARIABLE, HOLD_NOT_STARTED_VARIABLE, ORDER_TRACE_VARIABLE } from './fixtures/crash-hook.ts';

// A test-side composition of the real control plane and a real worker
// process against the make services, for the G2 crash scenarios (item 24b).

const POSTGRES = integrationEndpoint('TASKELITH_POSTGRES_URL');
const NATS = integrationEndpoint('TASKELITH_NATS_URL');
const COMPOSED_WORKER = new URL('./fixtures/composed-worker.ts', import.meta.url).pathname;
const ownerUid = process.getuid!();
const DIGEST = `sha256:${'cd'.repeat(32)}`;
const RUN_ID = 'crash-run';
const POLL_MILLISECONDS = 100;
export const SETTLE_MILLISECONDS = 60_000;
const STOP_MILLISECONDS = 15_000;
// The scripted child runs until the test releases it, at most this long.
const CHILD_BOUND_MILLISECONDS = 30_000;
const STREAM_KINDS = ['commands', 'observations', 'sdlc', 'quarantine', 'advisories'] as const;

const WORKFLOW = value(parseWorkflowDefinition({
  id: 'crash-workflow', version: '1', stages: [
    { id: 'specs', obligations: ['intake', 'specification'], origin: 'native', dependsOn: [] },
    { id: 'apply', obligations: ['implementation', 'review', 'verification', 'closure'], origin: 'native', dependsOn: ['specs'] },
  ],
}));
const BINDING = {
  pluginId: 'openspec', pluginVersion: '0.1.0', upstreamToolVersion: '1.6.0', workflowId: 'crash-workflow', workflowVersion: '1',
  workflowDigest: DIGEST, configurationRevision: 'config-1', policyRevision: 'policy-1',
};
const LIMITS = { ...TRANSPORT_LIMITS, streamMaxBytes: 64 * 1024 ** 2, ackWaitMilliseconds: 3_000, retryInitialMilliseconds: 100, retryMaxMilliseconds: 500, idlePollMilliseconds: 50 };

// The worker's structured logs that show its first pass and its contact.
const READY_EVENTS = ['worker.reconciliation.planned', 'worker.contact.online'];

let installations = 0;

export async function sql<Row extends pg.QueryResultRow>(url: URL, text: string, values: unknown[] = []): Promise<Row[]> {
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  try {
    return (await client.query<Row>(text, values)).rows;
  } finally {
    await client.end();
  }
}

export interface WaitOptions {
  readonly timeout?: number;
  readonly signal?: AbortSignal;
}

export async function waitFor(what: string | (() => string), condition: () => Promise<boolean>, options: WaitOptions = {}): Promise<void> {
  const deadline = Date.now() + (options.timeout ?? SETTLE_MILLISECONDS);
  while (!(await condition())) {
    options.signal?.throwIfAborted();
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${typeof what === 'string' ? what : what()}`);
    await delay(POLL_MILLISECONDS, undefined, options.signal === undefined ? {} : { signal: options.signal });
  }
}

// Settles as the promise does, or rejects once the signal aborts.
function settledUnlessAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

// What a scenario acquired, released last first; every release runs, and
// their errors come back together.
export class Releases {
  readonly #releases: Array<() => unknown> = [];

  add(release: () => unknown): void {
    this.#releases.push(release);
  }

  async releaseAll(): Promise<void> {
    const errors: unknown[] = [];
    for (let release = this.#releases.pop(); release !== undefined; release = this.#releases.pop()) {
      try {
        await release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, 'a release failed');
  }
}

// Runs the releases of a failed acquisition, then rethrows its error.
export async function releasedOnFailure<T>(releases: Releases, acquire: () => Promise<T>): Promise<T> {
  try {
    return await acquire();
  } catch (error) {
    await releases.releaseAll().catch((cleanup: unknown) => {
      throw new AggregateError([error, cleanup], 'a failed start could not release what it acquired');
    });
    throw error;
  }
}

interface Identity {
  readonly database: URL;
  readonly base: string;
  readonly authority: BrokerAuthority;
  readonly address: TransportAddress;
  readonly operator: string;
}

export interface LaunchRejectionLog {
  readonly executionId: string;
  readonly assignmentId: string;
  readonly reason: string;
}

// One scenario's own installation: a database, data roots, a broker account,
// and a control plane, so no scenario sees another's workers or tasks.
export class HarnessInstallation {
  readonly #identity: Identity;
  readonly #store: PostgresDatabase;
  readonly #logs: InMemoryLogSink;
  readonly #apiPort: number;
  readonly #releases: Releases;

  private constructor(identity: Identity, store: PostgresDatabase, logs: InMemoryLogSink, apiPort: number, releases: Releases) {
    this.#identity = identity;
    this.#store = store;
    this.#logs = logs;
    this.#apiPort = apiPort;
    this.#releases = releases;
  }

  static start(): Promise<HarnessInstallation> {
    const releases = new Releases();
    return releasedOnFailure(releases, () => HarnessInstallation.#acquire(releases));
  }

  static async #acquire(releases: Releases): Promise<HarnessInstallation> {
    installations += 1;
    const databaseName = `taskelith_crash_${process.pid}_${installations}`;
    await sql(POSTGRES, `CREATE DATABASE ${databaseName}`);
    releases.add(() => sql(POSTGRES, `DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`));
    const database = new URL(POSTGRES);
    database.pathname = `/${databaseName}`;
    const base = mkdtempSync(join(tmpdir(), 'taskelith-crash-'));
    releases.add(() => rmSync(base, { recursive: true, force: true }));
    const dataRoot = join(base, 'control-plane');
    const authority = await registeredAuthority(dataRoot);
    const environment = { TASKELITH_DATA_DIR: dataRoot, TASKELITH_POSTGRES_URL: database.href, TASKELITH_NATS_URL: NATS.href };
    const initialized = await admin(environment, ['init', '--actor', 'root@test', '--reason', 'crash scenario']) as { identity: { installationId: string }; operatorSecret: string };
    const address = value(TransportAddress.of(initialized.identity.installationId));
    releases.add(() => deleteStreams(authority, address));
    const logs = new InMemoryLogSink();
    const running: RunningControlPlane = value(await startControlPlane(controlPlaneSettings(dataRoot, database, logs)));
    releases.add(() => running.stop());
    const store = new PostgresDatabase(database);
    releases.add(() => store.close());
    const identity = { database, base, authority, address, operator: initialized.operatorSecret };
    return new HarnessInstallation(identity, store, logs, running.api.port, releases);
  }

  get base(): string {
    return this.#identity.base;
  }

  get apiUrl(): string {
    return `http://127.0.0.1:${this.#apiPort}/`;
  }

  get address(): TransportAddress {
    return this.#identity.address;
  }

  async enrollmentToken(): Promise<string> {
    const { database, base, operator } = this.#identity;
    const environment = { TASKELITH_DATA_DIR: join(base, 'control-plane'), TASKELITH_POSTGRES_URL: database.href, TASKELITH_NATS_URL: NATS.href };
    const issued = await admin({ ...environment, TASKELITH_OPERATOR_TOKEN: operator }, ['issue-enrollment-token']);
    return issued.enrollmentToken as string;
  }

  // The operator's run and planning task, as the item 23 smoke submits them.
  async submitTask(taskId: string): Promise<void> {
    await this.#operatorCall('/runs', { runId: RUN_ID, projectId: 'crash-project', binding: BINDING });
    await this.#operatorCall(`/runs/${RUN_ID}/tasks`, { taskId, kind: 'planning', stageId: 'specs' });
  }

  // The launch rejections the control plane observed, in order.
  launchRejections(): LaunchRejectionLog[] {
    return this.#logs.records.filter(({ event }) => event === 'execution.launch.rejected').map(({ fields }) => ({
      executionId: String(fields.executionId), assignmentId: String(fields.assignmentId), reason: String(fields.reason),
    }));
  }

  async task(taskId: string): Promise<Task> {
    return value(await this.#store.transaction((tx) => tx.tasks.get(taskId as TaskId)));
  }

  // A broker connection of the operator's side, for the commands stream.
  connectBroker(name: string): Promise<ControlPlaneConnection> {
    return brokerConnection(this.#identity.authority, this.address, name);
  }

  stop(): Promise<void> {
    return this.#releases.releaseAll();
  }

  async #operatorCall(path: string, body: unknown): Promise<void> {
    const response = await fetch(new URL(path, this.apiUrl), {
      method: 'POST', headers: { authorization: `Bearer ${this.#identity.operator}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(response.status, 201, `POST ${path}: ${await response.text()}`);
  }
}

function brokerConnection(authority: BrokerAuthority, address: TransportAddress, name: string): Promise<ControlPlaneConnection> {
  const creds = authority.user(name, Math.floor(Date.now() / 1000)).creds;
  return connectTransport({ server: NATS, address, creds }).then(value);
}

async function deleteStreams(authority: BrokerAuthority, address: TransportAddress): Promise<void> {
  const broker = await brokerConnection(authority, address, 'cleanup');
  try {
    for (const kind of STREAM_KINDS) await broker.jsm.streams.delete(address.streamName(kind)).catch(() => false);
  } finally {
    await broker.close();
  }
}

// A fresh broker account, registered on the test server that trusts the
// test operator.
async function registeredAuthority(dataRoot: string): Promise<BrokerAuthority> {
  const keys = { ...JSON.parse(integrationSecret('authority.json')), accountSeed: new TextDecoder().decode(createAccount().getSeed()) };
  value(value(ControlPlaneNamespace.open({ dataRoot, ownerUid })).create('broker-authority', keys));
  const authority = value(BrokerAuthority.fromKeys(keys));
  const system = value(await connectSystemAccount({ server: NATS, creds: integrationSecret('system.creds') }));
  try {
    value(await new NatsBrokerCredentials(authority, system.connection).publishRevocations([]));
  } finally {
    await system.close();
  }
  return authority;
}

function controlPlaneSettings(dataRoot: string, database: URL, logs: InMemoryLogSink): ControlPlaneSettings {
  return {
    dataRoot, ownerUid, postgres: database, nats: NATS, api: { host: '127.0.0.1', port: 0 },
    workflows: [{ definition: WORKFLOW, digest: DIGEST }], logSink: logs,
    sweepMilliseconds: 200, placementMilliseconds: 200, shutdownMilliseconds: 1000, transportLimits: LIMITS,
  };
}

async function admin(environment: Record<string, string>, argv: string[]): Promise<Record<string, unknown>> {
  const lines: string[] = [];
  const io: AdminIo = { environment, platform: process.platform, ownerUid, write: (line) => lines.push(line) };
  assert.equal(await adminMain(argv, io), 0, lines.join('\n'));
  return JSON.parse(lines.join('\n'));
}

export interface WorkerRun {
  readonly installation: HarnessInstallation;
  readonly seed: number;
  // Aborts every wait of the run, as the scenario's deadline passes.
  readonly signal: AbortSignal;
  // The crash point TASKELITH_CRASH_POINT arms in this run, if any.
  readonly armed?: string;
  readonly holdNotStarted?: boolean;
}

type ProcessExit = Awaited<ScenarioProcess['exited']>;

// One run of the composed worker process on the scenario's data root; a
// later run of the same installation is its restart.
export class ComposedWorker {
  readonly #process: ScenarioProcess;
  readonly #signal: AbortSignal;

  private constructor(process: ScenarioProcess, signal: AbortSignal) {
    this.#process = process;
    this.#signal = signal;
  }

  static async start(run: WorkerRun, enrollmentToken: string): Promise<ComposedWorker> {
    const { installation, seed, armed } = run;
    // A crash kills mid-write the coverage file of an inheriting child.
    const { [CRASH_POINT_VARIABLE]: _unarmed, NODE_V8_COVERAGE: _uncovered, ...inherited } = process.env;
    const env = {
      ...inherited, ...(armed === undefined ? {} : crashEnvironment(armed)), ...(run.holdNotStarted === true ? { [HOLD_NOT_STARTED_VARIABLE]: '1' } : {}),
      [SEED_VARIABLE]: String(seed), [CRASH_TRACE_VARIABLE]: crashTrace(installation), [ORDER_TRACE_VARIABLE]: orderTrace(installation),
      TASKELITH_DATA_DIR: join(installation.base, 'worker'), TASKELITH_CONTROL_PLANE_URL: installation.apiUrl,
      TASKELITH_NATS_URL: NATS.href, TASKELITH_ENROLLMENT_TOKEN: enrollmentToken, TASKELITH_WORKER_COMMAND: childCommand(installation),
    };
    // The base names the scenario on the command line, for leftoverProcesses.
    const started = await ScenarioProcess.start(process.execPath, ['--experimental-strip-types', COMPOSED_WORKER, installation.base], { env });
    return new ComposedWorker(started, run.signal);
  }

  // Resolves once the worker reconciled its journal and is online, so a
  // later stop finds its signal handlers in place.
  async ready(): Promise<void> {
    let exited = false;
    void this.#process.exited.then(() => {
      exited = true;
    });
    await waitFor('the restarted worker to be online', async () => {
      if (exited) throw new Error(`the worker exited before it was online: ${this.#process.stderr}`);
      return READY_EVENTS.every((event) => this.#process.stderr.includes(`"event":"${event}"`));
    }, { signal: this.#signal });
  }

  // Resolves once the armed crash killed the worker itself.
  async crashed(): Promise<void> {
    const exit = await this.#exitWithin('the armed crash', SETTLE_MILLISECONDS);
    assert.equal(exit.signal, 'SIGKILL', `the worker was not killed: ${this.#process.stderr}`);
  }

  // A service stop: SIGTERM, as a process supervisor sends it.
  async stop(): Promise<void> {
    this.#process.kill('SIGTERM');
    const exit = await this.#exitWithin('the stop', STOP_MILLISECONDS);
    assert.deepEqual(exit, { code: 0, signal: null }, `the worker did not stop cleanly: ${this.#process.stderr}`);
  }

  kill(): void {
    try {
      this.#process.kill('SIGKILL');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }

  // A bounded wait for the exit; a worker still running is killed.
  async #exitWithin(what: string, milliseconds: number): Promise<ProcessExit> {
    try {
      return await settledUnlessAborted(this.#process.exited, AbortSignal.any([this.#signal, AbortSignal.timeout(milliseconds)]));
    } catch (error) {
      this.kill();
      throw new Error(`the worker's exit after ${what} did not come: ${this.#process.stderr.slice(-2000)}`, { cause: error });
    }
  }
}

export function crashTrace(installation: HarnessInstallation): string {
  return join(installation.base, 'crash-trace');
}

// The armed points the composed processes reached before they crashed.
export function tracedCrashes(installation: HarnessInstallation): string[] {
  return readLines(crashTrace(installation));
}

function orderTrace(installation: HarnessInstallation): string {
  return join(installation.base, 'order-trace');
}

// The steps the test-side barriers established, in the order they came.
export function establishedOrder(installation: HarnessInstallation): string[] {
  return readLines(orderTrace(installation));
}

function spawnsFile(installation: HarnessInstallation): string {
  return join(installation.base, 'spawns');
}

function releaseFile(installation: HarnessInstallation): string {
  return join(installation.base, 'release');
}

// Lets every scripted child of the scenario exit, now and later.
export function releaseChild(installation: HarnessInstallation): void {
  writeFileSync(releaseFile(installation), '');
}

// The test-only scripted process: it appends its process ID to `spawns`
// once it starts, then exits 0 once released or at its bound.
function childCommand(installation: HarnessInstallation): string {
  const [spawns, release, order] = [spawnsFile(installation), releaseFile(installation), orderTrace(installation)].map((path) => JSON.stringify(path));
  const script = `const fs = require('node:fs'); fs.appendFileSync(${spawns}, process.pid + '\\n');`
    + ` const bound = Date.now() + ${CHILD_BOUND_MILLISECONDS};`
    + ' (function wait() { if (fs.existsSync(' + release + ')) return;'
    + ` if (Date.now() > bound) return fs.appendFileSync(${order}, 'child ' + process.pid + ' released by the bound\\n');`
    + ' setTimeout(wait, 50); })();';
  return JSON.stringify([process.execPath, '-e', script]);
}

export function spawnedChildren(installation: HarnessInstallation): string[] {
  return readLines(spawnsFile(installation));
}

// The records of adopting supervisors: a claim names supervisor.1, so an
// adopter writes a later serial (supervisor identity contract).
export function adoptingSupervisors(installation: HarnessInstallation): string[] {
  const paths = readdirSync(join(installation.base, 'worker'), { recursive: true, encoding: 'utf8' });
  return paths.filter((path) => /(^|\/)supervisor\.([2-9]|\d{2,})$/.test(path));
}

function readLines(path: string): string[] {
  try {
    return readFileSync(path, 'utf8').split('\n').filter((line) => line !== '');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

// The worker's journal, read while no worker process holds its lock.
export function journalSnapshot(installation: HarnessInstallation): JournalSnapshot {
  const root = value(openWorkerRoot({ dataRoot: join(installation.base, 'worker'), clock: SYSTEM_CLOCK }));
  try {
    return value(root.journal.snapshot());
  } finally {
    root.close();
  }
}

const runFile = promisify(execFile);

// Live processes, zombies excluded, that name the scenario's base on their
// command line: the worker, its supervisors, and the children.
export async function leftoverProcesses(installation: HarnessInstallation): Promise<string[]> {
  const { stdout } = await runFile('ps', ['-axww', '-o', 'pid=,stat=,command='], { encoding: 'utf8', maxBuffer: 16 * 1024 ** 2 });
  return stdout.split('\n').filter((line) => {
    const match = /^\s*(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    return match !== null && Number(match[1]) !== process.pid && !match[2]!.startsWith('Z') && match[3]!.includes(installation.base);
  });
}

// Kills whatever a failed scenario left, so the runner can finish.
export async function reapLeftovers(installation: HarnessInstallation): Promise<void> {
  for (const line of await leftoverProcesses(installation)) {
    try {
      process.kill(Number(line.trim().split(/\s+/)[0]), 'SIGKILL');
    } catch {
      // Gone since the listing.
    }
  }
}

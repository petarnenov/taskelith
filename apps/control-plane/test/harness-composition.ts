import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import pg from 'pg';
import { JetStreamApiCodes, JetStreamApiError } from '@nats-io/jetstream';
import { createAccount } from '@nats-io/nkeys';
import { adminMain, startControlPlane, type AdminIo, type ControlPlaneSettings, type RunningControlPlane } from '@taskelith/control-plane';
import { ControlPlaneNamespace } from '@taskelith/control-plane-store';
import type { JournalSnapshot, Task } from '@taskelith/execution';
import { BrokerAuthority, connectSystemAccount, connectTransport, NatsBrokerCredentials, TRANSPORT_LIMITS, TransportAddress, type ControlPlaneConnection } from '@taskelith/nats';
import { SYSTEM_CLOCK } from '@taskelith/node-observability';
import { InMemoryLogSink } from '@taskelith/observability';
import { PostgresDatabase } from '@taskelith/postgres';
import { parseWorkflowDefinition, type TaskId } from '@taskelith/sdlc';
import { CRASH_POINT_VARIABLE, crashEnvironment, integrationEndpoint, integrationSecret, ScenarioProcess, SEED_VARIABLE, uncoveredEnvironment, value } from '@taskelith/testing';
import { openWorkerRoot } from '@taskelith/worker-journal';
import { CRASH_TRACE_VARIABLE, FAIL_FIRST_PREPARE_VARIABLE, HOLD_NOT_STARTED_VARIABLE, ORDER_TRACE_VARIABLE } from './fixtures/crash-hook.ts';

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
// A wait gives up a database, broker, HTTP, or ps operation after this.
const OPERATION_MILLISECONDS = 20_000;
// The whole cleanup shares one deadline inside the runner's reserve; a
// step gets at most RELEASE_STEP, and one more try once it passed.
const CLEANUP_MILLISECONDS = 22_000;
const RELEASE_STEP_MILLISECONDS = 8_000;
const LAST_TRY_MILLISECONDS = 1_000;
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
  const client = new pg.Client({
    connectionString: url.href, connectionTimeoutMillis: OPERATION_MILLISECONDS, query_timeout: OPERATION_MILLISECONDS, statement_timeout: OPERATION_MILLISECONDS,
  });
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
  const description = () => (typeof what === 'string' ? what : what());
  while (!(await bounded(() => `a check while waiting for ${description()}`, condition, { signal: options.signal }))) {
    options.signal?.throwIfAborted();
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${description()}`);
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

export interface Bound<T> {
  readonly signal?: AbortSignal | undefined;
  readonly milliseconds?: number;
  // Disposes of what the operation yields after the wait gave it up.
  readonly late?: (value: T) => unknown;
}

// The operation's result, unless the bound passes or the signal aborts
// first; the operation gets the combined signal to stop early.
export async function bounded<T>(what: string | (() => string), operation: (signal: AbortSignal) => Promise<T>, bound: Bound<T> = {}): Promise<T> {
  const timeout = AbortSignal.timeout(bound.milliseconds ?? OPERATION_MILLISECONDS);
  const combined = bound.signal === undefined ? timeout : AbortSignal.any([bound.signal, timeout]);
  const running = operation(combined);
  try {
    return await settledUnlessAborted(running, combined);
  } catch (error) {
    if (!combined.aborted) throw error;
    const description = typeof what === 'string' ? what : what();
    if (bound.late !== undefined) void running.then(bound.late).catch((late: unknown) => process.emitWarning(`disposing late of ${description} failed: ${String(late)}`));
    throw new Error(`${description} did not end: ${String(combined.reason)}`, { cause: error });
  }
}

// What a scenario acquired, released last first under one deadline; every
// release runs, and their errors come back together.
export class Releases {
  readonly #releases: Array<() => unknown> = [];

  add(release: () => unknown): void {
    this.#releases.push(release);
  }

  async releaseAll(): Promise<void> {
    const deadline = Date.now() + CLEANUP_MILLISECONDS;
    const budget = () => Math.max(Math.min(RELEASE_STEP_MILLISECONDS, deadline - Date.now()), LAST_TRY_MILLISECONDS);
    const errors: unknown[] = [];
    for (let release = this.#releases.pop(); release !== undefined; release = this.#releases.pop()) {
      try {
        await bounded('a release', async () => release(), { milliseconds: budget() });
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, 'a release failed');
  }
}

// A release that runs its work once, however often it is called.
function once(work: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | undefined;
  return () => {
    running ??= work();
    return running;
  };
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
  // The scenario's signal, which ends every operation but the releases.
  readonly #signal: AbortSignal;

  private constructor(identity: Identity, store: PostgresDatabase, logs: InMemoryLogSink, apiPort: number, signal: AbortSignal) {
    this.#identity = identity;
    this.#store = store;
    this.#logs = logs;
    this.#apiPort = apiPort;
    this.#signal = signal;
  }

  // Its releases join the caller's, who releases them when done with it.
  static start(signal: AbortSignal, releases: Releases): Promise<HarnessInstallation> {
    return releasedOnFailure(releases, () => HarnessInstallation.#acquire(releases, signal));
  }

  // Each release is registered before its acquisition is awaited, so a
  // start that ends early still releases what came of it.
  static async #acquire(releases: Releases, signal: AbortSignal): Promise<HarnessInstallation> {
    installations += 1;
    const databaseName = `taskelith_crash_${process.pid}_${installations}`;
    releases.add(() => sql(POSTGRES, `DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`));
    await bounded('the database creation', () => sql(POSTGRES, `CREATE DATABASE ${databaseName}`), { signal });
    const database = new URL(POSTGRES);
    database.pathname = `/${databaseName}`;
    const base = mkdtempSync(join(tmpdir(), 'taskelith-crash-'));
    releases.add(() => rmSync(base, { recursive: true, force: true }));
    const dataRoot = join(base, 'control-plane');
    const authority = await bounded('the broker account', () => registeredAuthority(dataRoot), { signal });
    const environment = { TASKELITH_DATA_DIR: dataRoot, TASKELITH_POSTGRES_URL: database.href, TASKELITH_NATS_URL: NATS.href };
    const init = ['init', '--actor', 'root@test', '--reason', 'crash scenario'];
    const initialized = await bounded('the installation init', () => admin(environment, init), { signal }) as { identity: { installationId: string }; operatorSecret: string };
    const address = value(TransportAddress.of(initialized.identity.installationId));
    releases.add(() => deleteStreams(authority, address));
    const logs = new InMemoryLogSink();
    const starting = startControlPlane(controlPlaneSettings(dataRoot, database, logs));
    const stopStarted = once(async () => {
      const started = await starting;
      if (started.ok) await started.value.stop();
    });
    releases.add(stopStarted);
    const running: RunningControlPlane = value(await bounded('the control plane start', () => starting, { signal, late: stopStarted }));
    const store = new PostgresDatabase(database, { queryTimeoutMilliseconds: OPERATION_MILLISECONDS });
    releases.add(() => store.close());
    const identity = { database, base, authority, address, operator: initialized.operatorSecret };
    return new HarnessInstallation(identity, store, logs, running.api.port, signal);
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
    const issue = () => admin({ ...environment, TASKELITH_OPERATOR_TOKEN: operator }, ['issue-enrollment-token']);
    const issued = await bounded('the enrollment token', issue, { signal: this.#signal });
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
    const read = () => this.#store.transaction((tx) => tx.tasks.get(taskId as TaskId));
    return value(await bounded(`the read of task ${taskId}`, read, { signal: this.#signal }));
  }

  // A broker connection of the operator's side, for the commands stream.
  connectBroker(name: string): Promise<ControlPlaneConnection> {
    const connect = () => brokerConnection(this.#identity.authority, this.address, name);
    return bounded(`the broker connection ${name}`, connect, { signal: this.#signal, late: (connection) => connection.close() });
  }

  async #operatorCall(path: string, body: unknown): Promise<void> {
    await bounded(`POST ${path}`, async (signal) => {
      const response = await fetch(new URL(path, this.apiUrl), {
        method: 'POST', headers: { authorization: `Bearer ${this.#identity.operator}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal,
      });
      assert.equal(response.status, 201, `POST ${path}: ${await response.text()}`);
    }, { signal: this.#signal });
  }
}

function brokerConnection(authority: BrokerAuthority, address: TransportAddress, name: string): Promise<ControlPlaneConnection> {
  const creds = authority.user(name, Math.floor(Date.now() / 1000)).creds;
  return connectTransport({ server: NATS, address, creds }).then(value);
}

// Tries every stream; only an absent one is no error.
async function deleteStreams(authority: BrokerAuthority, address: TransportAddress): Promise<void> {
  const connect = () => brokerConnection(authority, address, 'cleanup');
  const broker = await bounded('the cleanup connection', connect, { late: (connection) => connection.close() });
  const errors: unknown[] = [];
  try {
    for (const kind of STREAM_KINDS) {
      await broker.jsm.streams.delete(address.streamName(kind)).catch((error: unknown) => {
        if (!isAbsentStream(error)) errors.push(error);
      });
    }
  } finally {
    await broker.close();
  }
  if (errors.length > 0) throw new AggregateError(errors, 'streams of the scenario were not deleted');
}

function isAbsentStream(error: unknown): boolean {
  return error instanceof JetStreamApiError && error.code === JetStreamApiCodes.StreamNotFound;
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
  // The crash point TASKELITH_CRASH_POINT arms in this run, if any, as
  // `<point>` or `<point>@<occurrence>`.
  readonly armed?: string;
  readonly holdNotStarted?: boolean;
  readonly failsFirstPrepare?: boolean;
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
    const { [CRASH_POINT_VARIABLE]: _unarmed, ...inherited } = uncoveredEnvironment();
    const env = {
      ...inherited, ...(armed === undefined ? {} : armedEnvironment(armed)), ...(run.holdNotStarted === true ? { [HOLD_NOT_STARTED_VARIABLE]: '1' } : {}),
      ...(run.failsFirstPrepare === true ? { [FAIL_FIRST_PREPARE_VARIABLE]: '1' } : {}),
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

function armedEnvironment(armed: string): Record<string, string> {
  const [point, occurrence] = armed.split('@') as [string, string?];
  return crashEnvironment(point, occurrence === undefined ? 1 : Number(occurrence));
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
  const { stdout } = await runFile('ps', ['-axww', '-o', 'pid=,stat=,command='], { encoding: 'utf8', maxBuffer: 16 * 1024 ** 2, timeout: OPERATION_MILLISECONDS });
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

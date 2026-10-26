import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
import { CRASH_TRACE_VARIABLE } from './fixtures/crash-hook.ts';

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
// The child runs this long, so a dead supervisor's child is still alive
// when recovery looks for it.
export const CHILD_MILLISECONDS = 3_000;

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

export async function waitFor(what: string | (() => string), condition: () => Promise<boolean>, timeoutMilliseconds = SETTLE_MILLISECONDS): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${typeof what === 'string' ? what : what()}`);
    await delay(POLL_MILLISECONDS);
  }
}

interface Identity {
  readonly database: URL;
  readonly base: string;
  readonly authority: BrokerAuthority;
  readonly address: TransportAddress;
  readonly operator: string;
}

// One scenario's own installation: a database, data roots, a broker account,
// and a control plane, so no scenario sees another's workers or tasks.
export class HarnessInstallation {
  readonly #identity: Identity;
  readonly #running: RunningControlPlane;
  readonly #store: PostgresDatabase;
  readonly #logs: InMemoryLogSink;

  private constructor(identity: Identity, running: RunningControlPlane, logs: InMemoryLogSink) {
    this.#identity = identity;
    this.#running = running;
    this.#logs = logs;
    this.#store = new PostgresDatabase(identity.database);
  }

  static async start(): Promise<HarnessInstallation> {
    installations += 1;
    const databaseName = `taskelith_crash_${process.pid}_${installations}`;
    await sql(POSTGRES, `CREATE DATABASE ${databaseName}`);
    const database = new URL(POSTGRES);
    database.pathname = `/${databaseName}`;
    const base = mkdtempSync(join(tmpdir(), 'taskelith-crash-'));
    const dataRoot = join(base, 'control-plane');
    const authority = await registeredAuthority(dataRoot);
    const environment = { TASKELITH_DATA_DIR: dataRoot, TASKELITH_POSTGRES_URL: database.href, TASKELITH_NATS_URL: NATS.href };
    const initialized = await admin(environment, ['init', '--actor', 'root@test', '--reason', 'crash scenario']) as { identity: { installationId: string }; operatorSecret: string };
    const address = value(TransportAddress.of(initialized.identity.installationId));
    const logs = new InMemoryLogSink();
    const running = value(await startControlPlane(controlPlaneSettings(dataRoot, database, logs)));
    return new HarnessInstallation({ database, base, authority, address, operator: initialized.operatorSecret }, running, logs);
  }

  get base(): string {
    return this.#identity.base;
  }

  get apiUrl(): string {
    return `http://127.0.0.1:${this.#running.api.port}/`;
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

  // The reasons of the launch rejections the control plane observed.
  launchRejections(): string[] {
    return this.#logs.records.filter(({ event }) => event === 'execution.launch.rejected').map(({ fields }) => String(fields.reason));
  }

  async task(taskId: string): Promise<Task> {
    return value(await this.#store.transaction((tx) => tx.tasks.get(taskId as TaskId)));
  }

  // A broker connection of the operator's side, for the commands stream.
  connectBroker(name: string): Promise<ControlPlaneConnection> {
    const creds = this.#identity.authority.user(name, Math.floor(Date.now() / 1000)).creds;
    return connectTransport({ server: NATS, address: this.address, creds }).then(value);
  }

  async stop(): Promise<void> {
    await this.#running.stop();
    await this.#store.close();
    const broker = await this.connectBroker('cleanup');
    for (const kind of ['commands', 'observations', 'sdlc', 'quarantine', 'advisories'] as const) {
      await broker.jsm.streams.delete(this.address.streamName(kind)).catch(() => false);
    }
    await broker.close();
    rmSync(this.base, { recursive: true, force: true });
    await sql(POSTGRES, `DROP DATABASE IF EXISTS ${this.#identity.database.pathname.slice(1)} WITH (FORCE)`);
  }

  async #operatorCall(path: string, body: unknown): Promise<void> {
    const response = await fetch(new URL(path, this.apiUrl), {
      method: 'POST', headers: { authorization: `Bearer ${this.#identity.operator}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(response.status, 201, `POST ${path}: ${await response.text()}`);
  }
}

// A fresh broker account, registered on the test server that trusts the
// test operator.
async function registeredAuthority(dataRoot: string): Promise<BrokerAuthority> {
  const keys = { ...JSON.parse(integrationSecret('authority.json')), accountSeed: new TextDecoder().decode(createAccount().getSeed()) };
  value(value(ControlPlaneNamespace.open({ dataRoot, ownerUid })).create('broker-authority', keys));
  const authority = value(BrokerAuthority.fromKeys(keys));
  const system = value(await connectSystemAccount({ server: NATS, creds: integrationSecret('system.creds') }));
  value(await new NatsBrokerCredentials(authority, system.connection).publishRevocations([]));
  await system.close();
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
  // The crash point TASKELITH_CRASH_POINT arms in this run, if any.
  readonly armed?: string;
}

// One run of the composed worker process on the scenario's data root; a
// later run of the same installation is its restart.
export class ComposedWorker {
  readonly #process: ScenarioProcess;

  private constructor(process: ScenarioProcess) {
    this.#process = process;
  }

  static async start(run: WorkerRun, enrollmentToken: string): Promise<ComposedWorker> {
    const { installation, seed, armed } = run;
    const { [CRASH_POINT_VARIABLE]: _unarmed, ...inherited } = process.env;
    const env = {
      ...inherited, ...(armed === undefined ? {} : crashEnvironment(armed)),
      [SEED_VARIABLE]: String(seed), [CRASH_TRACE_VARIABLE]: crashTrace(installation),
      TASKELITH_DATA_DIR: join(installation.base, 'worker'), TASKELITH_CONTROL_PLANE_URL: installation.apiUrl,
      TASKELITH_NATS_URL: NATS.href, TASKELITH_ENROLLMENT_TOKEN: enrollmentToken, TASKELITH_WORKER_COMMAND: childCommand(installation),
    };
    // The base names the scenario on the command line, for leftoverProcesses.
    return new ComposedWorker(await ScenarioProcess.start(process.execPath, ['--experimental-strip-types', COMPOSED_WORKER, installation.base], { env }));
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
    });
  }

  // Resolves once the armed crash killed the worker itself.
  async crashed(): Promise<void> {
    const exit = await this.#process.exited;
    assert.equal(exit.signal, 'SIGKILL', `the worker was not killed: ${this.#process.stderr}`);
  }

  // A service stop: SIGTERM, as a process supervisor sends it.
  async stop(): Promise<void> {
    this.#process.kill('SIGTERM');
    const exit = await this.#process.exited;
    assert.deepEqual(exit, { code: 0, signal: null }, `the worker did not stop cleanly: ${this.#process.stderr}`);
  }

  kill(): void {
    try {
      this.#process.kill('SIGKILL');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
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

function spawnsFile(installation: HarnessInstallation): string {
  return join(installation.base, 'spawns');
}

// The test-only scripted process: it appends its process ID to `spawns`
// once it starts, so a scenario counts every spawn, then exits 0.
function childCommand(installation: HarnessInstallation): string {
  const script = `require('node:fs').appendFileSync(${JSON.stringify(spawnsFile(installation))}, process.pid + '\\n');`
    + ` setTimeout(() => {}, ${CHILD_MILLISECONDS});`;
  return JSON.stringify([process.execPath, '-e', script]);
}

export function spawnedChildren(installation: HarnessInstallation): string[] {
  return readLines(spawnsFile(installation));
}

function readLines(path: string): string[] {
  try {
    return readFileSync(path, 'utf8').split('\n').filter((line) => line !== '');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

// The worker's journal, read once its process stopped and the lock is free.
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

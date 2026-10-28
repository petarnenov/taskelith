import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { LaunchAuthorityClient } from '@taskelith/execution';
import { stubAdmissionCheck, type WorkerAdmissionCheck } from '@taskelith/fleet';
import { ok, type Result } from '@taskelith/kernel';
import { connectWorkerTransport, type TransportConnection } from '@taskelith/nats';
import { SYSTEM_CLOCK } from '@taskelith/node-observability';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { executionAccountOf, seededUuids, value, type SeededRandom } from '@taskelith/testing';
import { linuxContainmentCheck, startWorker, type LaunchHost, type LaunchSettings, type RunningWorker, type WorkerDependencies, type WorkerSettings } from '@taskelith/worker';
import { HttpEnrollmentClient, HttpLaunchAuthorityClient } from '@taskelith/worker-control-plane-client';
import { processGroupHost } from './process-group-supervision.ts';
import { SCENARIO_LIMITS } from './scenario-installation.ts';
import { SCENARIO_LAUNCH, SCENARIO_LAUNCH_HOST, workerContainmentParent, workerLaunchHost } from './scenario-launch.ts';
import { within } from './waiting.ts';

// The worker's own timers (heartbeats, broker retries, lost contact) and
// its launch back-offs run this many times faster than the targets.
export const TIME_SCALE = 20;
const LAUNCH_POLL_MILLISECONDS = 100;
const GIBIBYTE = 2 ** 30;
const EXT4_MAGIC = 0xef53n;
const STOP_MILLISECONDS = 30_000;
const runningWorkers = new Set<ScenarioWorker>();
// A scripted process that cannot end on its own, so only a signal or a
// release ends it.
export const HELD_RUN = 'held';
export type ScriptedRun = number | typeof HELD_RUN;

// Where a worker finds its installation: the API, and the base directory
// that holds the scenario's data roots.
export interface WorkerSite {
  readonly apiUrl: URL;
  readonly base: string;
}

export interface ScenarioWorkerOptions {
  readonly name: string;
  readonly random: SeededRandom;
  // Only the first start enrolls; a restart opens the same root.
  readonly enrollmentToken?: string;
  // `proxied` routes the worker's broker connection through Toxiproxy.
  readonly nats: URL;
  // How long the scripted process runs before it exits with code 0; with
  // `HELD_RUN`, until the worker releases its scripted processes.
  readonly runMilliseconds: ScriptedRun;
  // Wraps the HTTP launch authority, so a scenario can order requests.
  readonly authority?: (client: LaunchAuthorityClient) => LaunchAuthorityClient;
  // Free space of the data root's volume; ample unless a scenario says.
  readonly freeBytes?: () => number;
  // Awaited before each supervisor starts, after W4.
  readonly beforeSupervisorStart?: () => Promise<void>;
  // Offered slots; two unless a scenario says.
  readonly slots?: number;
  // Wraps the broker connection, for a test-side crash point.
  readonly transport?: (transport: TransportConnection) => TransportConnection;
}

// The product's startWorker with scaled timers, seeded draws and IDs, and
// the worker's own launch host under a native launch, else the test one.
export class ScenarioWorker {
  readonly logs = new InMemoryLogSink();
  readonly dataRoot: string;
  readonly #releaseFile: string;
  readonly #site: WorkerSite;
  readonly #options: ScenarioWorkerOptions;
  readonly #containmentParent: string | undefined;
  #running: RunningWorker | undefined;

  constructor(site: WorkerSite, options: ScenarioWorkerOptions) {
    this.#site = site;
    this.#options = options;
    this.dataRoot = join(site.base, options.name);
    this.#releaseFile = `${this.dataRoot}.released`;
    this.#containmentParent = SCENARIO_LAUNCH === undefined ? undefined : workerContainmentParent(SCENARIO_LAUNCH, site.base, options.name);
  }

  get running(): RunningWorker {
    if (this.#running === undefined) throw new Error(`worker ${this.#options.name} is not running`);
    return this.#running;
  }

  get name(): string {
    return this.#options.name;
  }

  // Set only under the Linux launch: this worker's own containment parent.
  get containmentParent(): string | undefined {
    return this.#containmentParent;
  }

  get workerId(): string {
    return this.running.identity.workerId;
  }

  // Lets held scripted processes, running or future, exit 0 until the
  // next hold.
  releaseScriptedProcesses(): void {
    writeFileSync(this.#releaseFile, '');
  }

  holdScriptedProcesses(): void {
    rmSync(this.#releaseFile, { force: true });
  }

  async start(): Promise<RunningWorker> {
    if (this.#containmentParent !== undefined) mkdirSync(this.#containmentParent, { recursive: true });
    this.#running = value(await startWorker(this.#settings(), this.#dependencies()));
    runningWorkers.add(this);
    return this.#running;
  }

  // Fails naming the worker if its runtime does not end within the bound.
  async stop(): Promise<void> {
    const running = this.#running;
    this.#running = undefined;
    runningWorkers.delete(this);
    if (running !== undefined) await within(running.stop(), STOP_MILLISECONDS, `the stop of worker ${this.#options.name}`);
  }

  #settings(): WorkerSettings {
    const { enrollmentToken, runMilliseconds } = this.#options;
    return {
      dataRoot: this.dataRoot, controlPlaneUrl: this.#site.apiUrl, natsUrl: this.#options.nats,
      host: { platform: SCENARIO_LAUNCH_HOST === 'macos-supervisor' ? 'darwin' : 'linux', architecture: process.arch === 'arm64' ? 'arm64' : 'x64', hostname: this.#options.name },
      capacity: { slots: this.#options.slots ?? 2, cpuMillicores: 4_000, memoryMebibytes: 8_192, controls: [] },
      launch: this.#launch(runMilliseconds),
      ...(this.#containmentParent === undefined ? {} : { containmentParent: this.#containmentParent }),
      ...(enrollmentToken === undefined ? {} : { enrollmentToken }),
    };
  }

  #launch(runMilliseconds: ScriptedRun): LaunchSettings {
    const command = this.#scriptedProcess(runMilliseconds);
    return SCENARIO_LAUNCH === undefined ? { command } : { command, executionAccount: executionAccountOf(SCENARIO_LAUNCH) };
  }

  #scriptedProcess(runMilliseconds: ScriptedRun) {
    return runMilliseconds === HELD_RUN ? heldProcess(this.dataRoot, this.#releaseFile) : scriptedProcess(runMilliseconds, this.dataRoot);
  }

  #launchHost(settings: WorkerSettings, executions: string): Result<LaunchHost> {
    const beforeStart = this.#options.beforeSupervisorStart ?? (async () => undefined);
    if (SCENARIO_LAUNCH_HOST !== 'process-group') return workerLaunchHost(settings, executions, beforeStart);
    return ok(processGroupHost(executions, this.#scriptedProcess(this.#options.runMilliseconds), beforeStart));
  }

  // The worker's own admission check under a native launch, as apps/worker
  // composes it; a passing stub on the process-group host.
  #admissionCheck(): WorkerAdmissionCheck {
    return SCENARIO_LAUNCH_HOST === 'process-group' ? stubAdmissionCheck() : linuxContainmentCheck(this.#settings());
  }

  // The real probe on macOS; the Linux test volume may be tmpfs, which the
  // real probe refuses.
  #volumeProbe(): Pick<WorkerDependencies, 'probe'> {
    if (SCENARIO_LAUNCH_HOST === 'macos-supervisor') return {};
    return { probe: () => ok({ platform: 'linux' as const, magic: EXT4_MAGIC }) };
  }

  #dependencies(): WorkerDependencies {
    const { random } = this.#options;
    const ids = seededUuids('ExecutionId', random);
    const draw = () => random.nextInt(1_000_000) / 1_000_000;
    const logger = new Logger(this.logs, SYSTEM_CLOCK);
    const endpoint = { baseUrl: this.#site.apiUrl, timeoutMilliseconds: 10_000 };
    const wrap = this.#options.authority ?? ((client: LaunchAuthorityClient) => client);
    const freeBytes = this.#options.freeBytes ?? (() => 1024 * GIBIBYTE);
    const wrapTransport = this.#options.transport ?? ((transport: TransportConnection) => transport);
    return {
      enrollment: new HttpEnrollmentClient(endpoint),
      connect: async (endpoint) => {
        const connected = await connectWorkerTransport(endpoint);
        return connected.ok ? ok(wrapTransport(connected.value)) : connected;
      },
      newJournalId: () => randomBytes(16).toString('hex'),
      clock: SYSTEM_CLOCK,
      ...this.#volumeProbe(),
      space: () => ok({ availableBytes: freeBytes(), totalBytes: 2048 * GIBIBYTE }),
      daemon: { residentBytes: () => ok(0), eventLoopLagMilliseconds: () => ok(0), watch: idleUntil },
      pressurePollMilliseconds: LAUNCH_POLL_MILLISECONDS,
      limits: SCENARIO_LIMITS,
      admissionChecks: [this.#admissionCheck()],
      sleep: scaledSleep, draw, logger,
      launching: {
        authority: (credential) => wrap(new HttpLaunchAuthorityClient({ ...endpoint, credential })),
        host: (settings, executions) => this.#launchHost(settings, executions),
        sleep: scaledSleep, draw, newId: () => ids.next(), pollMilliseconds: LAUNCH_POLL_MILLISECONDS, logger,
        onFailure: (error) => logger.warn('scenario.launch.failed', { message: String((error as Error)?.message ?? error) }),
      },
    };
  }
}

// Stops each worker even if another's stop fails, then fails naming them.
export async function stopWorkers(...workers: readonly (ScenarioWorker | undefined)[]): Promise<void> {
  const stopped = await Promise.allSettled(workers.map((worker) => worker?.stop()));
  const failures = stopped.flatMap((result) => (result.status === 'rejected' ? [String(result.reason)] : []));
  if (failures.length > 0) throw new Error(`worker stop failed: ${failures.join('; ')}`);
}

// The workers a timed-out scenario left running.
export function stopRunningWorkers(): Promise<void> {
  return stopWorkers(...runningWorkers);
}

export function runningWorkerNames(): string[] {
  return [...runningWorkers].map((worker) => worker.name);
}

// The G2 scripted process; the data root as an argument marks it, so a
// scenario's cleanup finds what it left running.
export function scriptedProcess(runMilliseconds: number, marker: string) {
  return { executable: process.execPath, arguments: ['-e', `setTimeout(() => {}, ${runMilliseconds})`, marker] };
}

// Polls for the release file and exits with code 0 once it exists.
function heldProcess(marker: string, releaseFile: string) {
  const script = `const { existsSync } = require('node:fs');
(function wait() { if (!existsSync(process.argv[2])) setTimeout(wait, 50); })();`;
  return { executable: process.execPath, arguments: ['-e', script, marker, releaseFile] };
}

function scaledSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return delay(Math.ceil(milliseconds / TIME_SCALE), undefined, { signal }).catch(() => undefined);
}

async function idleUntil(signal: AbortSignal): Promise<void> {
  if (!signal.aborted) await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
}

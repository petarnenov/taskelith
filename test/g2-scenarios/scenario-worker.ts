import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { LaunchAuthorityClient } from '@taskelith/execution';
import { ok } from '@taskelith/kernel';
import { connectWorkerTransport, type TransportConnection } from '@taskelith/nats';
import { SYSTEM_CLOCK } from '@taskelith/node-observability';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { seededUuids, value, type SeededRandom } from '@taskelith/testing';
import { startWorker, type RunningWorker, type WorkerDependencies, type WorkerSettings } from '@taskelith/worker';
import { HttpEnrollmentClient, HttpLaunchAuthorityClient } from '@taskelith/worker-control-plane-client';
import { processGroupHost } from './process-group-supervision.ts';
import { SCENARIO_LIMITS } from './scenario-installation.ts';

// The worker's own timers (heartbeats, broker retries, lost contact) and
// its launch back-offs run this many times faster than the targets.
export const TIME_SCALE = 20;
const LAUNCH_POLL_MILLISECONDS = 100;
const GIBIBYTE = 2 ** 30;
const EXT4_MAGIC = 0xef53n;

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
  // How long the scripted process runs before it exits with code 0.
  readonly runMilliseconds: number;
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

// A worker composed by the product's startWorker, with test-side scaled
// timers, seeded draws and identities, and the process-group launch host.
export class ScenarioWorker {
  readonly logs = new InMemoryLogSink();
  readonly dataRoot: string;
  readonly #site: WorkerSite;
  readonly #options: ScenarioWorkerOptions;
  #running: RunningWorker | undefined;

  constructor(site: WorkerSite, options: ScenarioWorkerOptions) {
    this.#site = site;
    this.#options = options;
    this.dataRoot = join(site.base, options.name);
  }

  get running(): RunningWorker {
    if (this.#running === undefined) throw new Error(`worker ${this.#options.name} is not running`);
    return this.#running;
  }

  get workerId(): string {
    return this.running.identity.workerId;
  }

  async start(): Promise<RunningWorker> {
    this.#running = value(await startWorker(this.#settings(), this.#dependencies()));
    return this.#running;
  }

  async stop(): Promise<void> {
    await this.#running?.stop();
    this.#running = undefined;
  }

  #settings(): WorkerSettings {
    const { enrollmentToken, runMilliseconds } = this.#options;
    return {
      dataRoot: this.dataRoot, controlPlaneUrl: this.#site.apiUrl, natsUrl: this.#options.nats,
      host: { platform: 'linux', architecture: process.arch === 'arm64' ? 'arm64' : 'x64', hostname: this.#options.name },
      capacity: { slots: this.#options.slots ?? 2, cpuMillicores: 4_000, memoryMebibytes: 8_192, controls: [] },
      launch: { command: scriptedProcess(runMilliseconds, this.dataRoot) },
      ...(enrollmentToken === undefined ? {} : { enrollmentToken }),
    };
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
      // The test volume may be tmpfs, which the real probe refuses.
      probe: () => ok({ platform: 'linux' as const, magic: EXT4_MAGIC }),
      space: () => ok({ availableBytes: freeBytes(), totalBytes: 2048 * GIBIBYTE }),
      daemon: { residentBytes: () => ok(0), eventLoopLagMilliseconds: () => ok(0), watch: idleUntil },
      pressurePollMilliseconds: LAUNCH_POLL_MILLISECONDS,
      limits: SCENARIO_LIMITS,
      sleep: scaledSleep, draw, logger,
      launching: {
        authority: (credential) => wrap(new HttpLaunchAuthorityClient({ ...endpoint, credential })),
        host: (_settings, executions) => ok(processGroupHost(executions, scriptedProcess(this.#options.runMilliseconds, this.dataRoot), this.#options.beforeSupervisorStart)),
        sleep: scaledSleep, draw, newId: () => ids.next(), pollMilliseconds: LAUNCH_POLL_MILLISECONDS, logger,
        onFailure: (error) => logger.warn('scenario.launch.failed', { message: String((error as Error)?.message ?? error) }),
      },
    };
  }
}

// The G2 scripted process; the data root as an argument marks it, so a
// scenario's cleanup finds what it left running.
export function scriptedProcess(runMilliseconds: number, marker: string) {
  return { executable: process.execPath, arguments: ['-e', `setTimeout(() => {}, ${runMilliseconds})`, marker] };
}

function scaledSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return delay(Math.ceil(milliseconds / TIME_SCALE), undefined, { signal }).catch(() => undefined);
}

async function idleUntil(signal: AbortSignal): Promise<void> {
  if (!signal.aborted) await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
}

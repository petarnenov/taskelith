import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import {
  connectTransport,
  ensureAdvisoryConsumer,
  ensureStreams,
  JetStreamPublisher,
  OutboxPublisher,
  Quarantine,
  runOutboxPublisher,
  runQuarantineKeeper,
  TransportAddress,
  TRANSPORT_LIMITS,
  type ControlPlaneConnection,
  type TransportLimits,
} from '@taskelith/nats';
import { EventLoopLagMonitor, JsonLinesLogSink, runPeriodically, SYSTEM_CLOCK } from '@taskelith/node-observability';
import { InMemoryMetrics, Logger, sampleControlPlane, type LogSink } from '@taskelith/observability';
import { PostgresControlPlaneSignals, PostgresOutboxRelay } from '@taskelith/postgres';
import { Administration, type AdministrationSettings } from '../admin/administration.js';
import { createApiServer } from '../api/api-server.js';
import { ControlPlaneApi } from '../api/control-plane-api.js';
import { RunService } from '../application/run-service.js';
import { TaskService } from '../application/task-service.js';
import { WorkflowRegistry, type KnownWorkflow } from '../application/workflow-registry.js';
import { InstallationPublicationFence } from './installation-publication-fence.js';

// Provisional G2 values in docs/operational-targets.md, which G6 verifies.
export const GRACE_WINDOW_SWEEP_MILLISECONDS = 60_000;
// How long a stop waits for the loops before it cancels what still blocks.
export const SHUTDOWN_DEADLINE_MILLISECONDS = 30_000;
const CANCELLED_SETTLE_MILLISECONDS = 5_000;

export interface ApiEndpoint {
  // Loopback by default: G2 serves plain HTTP; TLS is G3 item 26 (D11).
  readonly host: string;
  readonly port: number;
}

export interface ControlPlaneSettings extends Omit<AdministrationSettings, 'logger' | 'metrics'> {
  readonly api: ApiEndpoint;
  readonly workflows: readonly KnownWorkflow[];
  readonly logSink?: LogSink;
  readonly sweepMilliseconds?: number;
  readonly shutdownMilliseconds?: number;
  // Shorter or smaller ones only in tests; production takes the targets.
  readonly transportLimits?: TransportLimits;
}

export interface RunningControlPlane {
  readonly api: ApiEndpoint;
  readonly metrics: InMemoryMetrics;
  // Settles when the service has stopped: `failed` after a loop defect.
  readonly stopped: Promise<'stopped' | 'failed'>;
  stop(): Promise<void>;
}

// The composition root: one logger and one metrics store for every adapter,
// the API, and the background loops, which one signal stops.
export async function startControlPlane(settings: ControlPlaneSettings): Promise<Result<RunningControlPlane>> {
  const logger = new Logger(settings.logSink ?? new JsonLinesLogSink(process.stdout), SYSTEM_CLOCK);
  const metrics = new InMemoryMetrics();
  const cleanup = new CleanupStack();
  try {
    const started = await wire(settings, logger, metrics, cleanup);
    if (!started.ok) await cleanup.run();
    return started;
  } catch (error) {
    await cleanup.run();
    return err(failure('internal', `the control plane did not start: ${error instanceof Error ? error.message : String(error)}`));
  }
}

async function wire(settings: ControlPlaneSettings, logger: Logger, metrics: InMemoryMetrics, cleanup: CleanupStack): Promise<Result<RunningControlPlane>> {
  const admin = Administration.open({ ...settings, logger, metrics });
  if (!admin.ok) return admin;
  cleanup.push(() => admin.value.close());
  const identity = await admin.value.verifiedInstallation();
  if (!identity.ok) return identity;
  const authority = admin.value.brokerAuthority();
  if (!authority.ok) return authority;
  const address = TransportAddress.of(identity.value.installationId);
  if (!address.ok) return address;
  const broker = await connectTransport({
    server: settings.nats, address: address.value, creds: authority.value.user('control-plane', epochSeconds()).creds,
    ...(settings.natsTls === undefined ? {} : { tls: settings.natsTls }),
  });
  if (!broker.ok) return broker;
  cleanup.push(() => broker.value.close());
  const limits = settings.transportLimits ?? TRANSPORT_LIMITS;
  const topology = await prepareTopology(broker.value, address.value, limits);
  if (!topology.ok) return topology;
  const enrollment = await admin.value.enrollmentService();
  if (!enrollment.ok) return enrollment;
  cleanup.push(() => enrollment.value.close());
  const database = admin.value.database;
  const fence = new InstallationPublicationFence(database);
  const quarantine = new Quarantine(broker.value.jsm, broker.value.js, address.value, limits);
  const api = createApiServer(new ControlPlaneApi({
    runs: new RunService(database, new WorkflowRegistry(settings.workflows)),
    tasks: new TaskService(database),
    operator: admin.value.operator,
    enrollment: enrollment.value.service,
    // A redrive publishes too, so it waits for the same fence.
    quarantine: { records: (from, limit) => quarantine.records(from, limit), redrive: (sequence) => fence.hold(() => quarantine.redrive(sequence)) },
  }), { logger });
  const listening = await listen(api, settings.api);
  if (!listening.ok) return listening;
  const closeApi = once(() => new Promise<void>((resolve) => {
    api.close(() => resolve());
    api.closeAllConnections();
  }));
  cleanup.push(closeApi);
  const controller = new AbortController();
  const lag = new EventLoopLagMonitor();
  cleanup.push(async () => lag.stop());
  const publisher = new OutboxPublisher(new PostgresOutboxRelay(database), new JetStreamPublisher(broker.value.js), address.value, { logger, limits, fence });
  const sweep = settings.sweepMilliseconds ?? GRACE_WINDOW_SWEEP_MILLISECONDS;
  let outcome: 'stopped' | 'failed' = 'stopped';
  let settle!: (value: 'stopped' | 'failed') => void;
  const stopped = new Promise<'stopped' | 'failed'>((resolve) => { settle = resolve; });
  const deadline = settings.shutdownMilliseconds ?? SHUTDOWN_DEADLINE_MILLISECONDS;
  // No new request first; then the loops get the deadline, after which what
  // still blocks in PostgreSQL is cancelled before everything is closed.
  const stop = once(async () => {
    const closing = closeApi();
    controller.abort();
    const settled = Promise.allSettled(loops);
    if (!(await within(settled, deadline))) {
      const cancelled = await database.cancelActiveStatements().catch(() => 0);
      logger.warn('control-plane.stop.forced', { deadlineMs: deadline, cancelled });
      await within(settled, CANCELLED_SETTLE_MILLISECONDS);
    }
    await within(closing, CANCELLED_SETTLE_MILLISECONDS);
    await cleanup.run();
    settle(outcome);
  });
  // A loop that fails is a defect that stops the service, unless the stop
  // itself made it fail, such as by cancelling its statement.
  const supervise = (name: string, loop: Promise<void>) => loop.catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (controller.signal.aborted) {
      logger.info('control-plane.loop.stopped', { loop: name, message });
      return;
    }
    logger.error('control-plane.loop.failed', { loop: name, message });
    outcome = 'failed';
    void stop();
  });
  const loops = [
    supervise('outbox', runOutboxPublisher(publisher, controller.signal, limits)),
    supervise('quarantine', runQuarantineKeeper(quarantine, controller.signal, limits)),
    supervise('grace-windows', runPeriodically(async () => logFailure(logger, 'fleet.grace-windows.failed', await enrollment.value.service.expireGraceWindows()), controller.signal, sweep)),
    supervise('sampler', runPeriodically(() => sampleControlPlane(new PostgresControlPlaneSignals(database), metrics, logger), controller.signal)),
    supervise('event-loop', runPeriodically(() => lag.sample(metrics), controller.signal)),
  ];
  logger.info('control-plane.started', { host: listening.value.host, port: listening.value.port });
  return ok({ api: listening.value, metrics, stopped, stop });
}

// Releases what was acquired, newest first; a release that fails does not
// keep the others from running.
class CleanupStack {
  readonly #releases: Array<() => Promise<void>> = [];

  push(release: () => Promise<void>): void {
    this.#releases.push(release);
  }

  async run(): Promise<void> {
    while (this.#releases.length > 0) await this.#releases.pop()!().catch(() => undefined);
  }
}

// Whether the promise settled before the timeout.
async function within(promise: Promise<unknown>, milliseconds: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), milliseconds); });
  try {
    return await Promise.race([promise.then(() => true, () => true), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// The first call runs the work; later calls share its promise.
function once(work: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | undefined;
  return () => (running ??= work());
}

async function prepareTopology(broker: ControlPlaneConnection, address: TransportAddress, limits: TransportLimits): Promise<Result<void>> {
  const streams = await ensureStreams(broker.jsm, address, limits);
  return streams.ok ? ensureAdvisoryConsumer(broker.jsm, address, limits) : streams;
}

function listen(server: Server, endpoint: ApiEndpoint): Promise<Result<ApiEndpoint>> {
  return new Promise((resolve) => {
    server.once('error', (error) => resolve(err(failure('unavailable', `the API cannot listen: ${error.message}`))));
    server.listen(endpoint.port, endpoint.host, () => {
      const bound = server.address() as AddressInfo;
      resolve(ok({ host: bound.address, port: bound.port }));
    });
  });
}

function logFailure(logger: Logger, event: string, result: Result<unknown>): void {
  if (!result.ok) logger.warn(event, { code: result.error.code, message: result.error.message });
}

function epochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

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
  type ControlPlaneConnection,
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
import { QuarantineGuardedOutbox } from './quarantine-guarded-outbox.js';

// Provisional G2 values in docs/operational-targets.md, which G6 verifies.
export const GRACE_WINDOW_SWEEP_MILLISECONDS = 60_000;

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
}

export interface RunningControlPlane {
  readonly api: ApiEndpoint;
  readonly metrics: InMemoryMetrics;
  stop(): Promise<void>;
}

// The composition root: one logger and one metrics store for every adapter,
// the API, and the background loops, which one signal stops.
export async function startControlPlane(settings: ControlPlaneSettings): Promise<Result<RunningControlPlane>> {
  const logger = new Logger(settings.logSink ?? new JsonLinesLogSink(process.stdout), SYSTEM_CLOCK);
  const metrics = new InMemoryMetrics();
  const admin = Administration.open({ ...settings, logger, metrics });
  if (!admin.ok) return admin;
  const started = await wire(admin.value, settings, logger, metrics);
  if (!started.ok) await admin.value.close();
  return started;
}

async function wire(admin: Administration, settings: ControlPlaneSettings, logger: Logger, metrics: InMemoryMetrics): Promise<Result<RunningControlPlane>> {
  const identity = await admin.verifiedInstallation();
  if (!identity.ok) return identity;
  const authority = admin.brokerAuthority();
  if (!authority.ok) return authority;
  const address = TransportAddress.of(identity.value.installationId);
  if (!address.ok) return address;
  const broker = await connectTransport({
    server: settings.nats, address: address.value, creds: authority.value.user('control-plane', epochSeconds()).creds,
    ...(settings.natsTls === undefined ? {} : { tls: settings.natsTls }),
  });
  if (!broker.ok) return broker;
  const topology = await prepareTopology(broker.value, address.value);
  const enrollment = topology.ok ? await admin.enrollmentService() : topology;
  if (!enrollment.ok) {
    await broker.value.close();
    return enrollment;
  }
  const quarantine = new Quarantine(broker.value.jsm, broker.value.js, address.value);
  const database = admin.database;
  const api = createApiServer(new ControlPlaneApi({
    runs: new RunService(database, new WorkflowRegistry(settings.workflows)),
    tasks: new TaskService(database),
    operator: admin.operator,
    enrollment: enrollment.value.service,
    quarantine,
  }), { logger });
  const listening = await listen(api, settings.api);
  if (!listening.ok) {
    await enrollment.value.close();
    await broker.value.close();
    return listening;
  }
  const controller = new AbortController();
  const lag = new EventLoopLagMonitor();
  const publisher = new OutboxPublisher(
    new QuarantineGuardedOutbox(database, new PostgresOutboxRelay(database)), new JetStreamPublisher(broker.value.js), address.value, { logger },
  );
  const sweep = settings.sweepMilliseconds ?? GRACE_WINDOW_SWEEP_MILLISECONDS;
  const loops = [
    runOutboxPublisher(publisher, controller.signal),
    runQuarantineKeeper(quarantine, controller.signal),
    runPeriodically(async () => logFailure(logger, 'fleet.grace-windows.failed', await enrollment.value.service.expireGraceWindows()), controller.signal, sweep),
    runPeriodically(() => sampleControlPlane(new PostgresControlPlaneSignals(database), metrics, logger), controller.signal),
    runPeriodically(() => lag.sample(metrics), controller.signal),
  ];
  logger.info('control-plane.started', { host: listening.value.host, port: listening.value.port });
  return ok({
    api: listening.value,
    metrics,
    stop: async () => {
      controller.abort();
      await new Promise<void>((resolve) => api.close(() => resolve()));
      await Promise.allSettled(loops);
      lag.stop();
      await enrollment.value.close();
      await broker.value.close();
      await admin.close();
    },
  });
}

async function prepareTopology(broker: ControlPlaneConnection, address: TransportAddress): Promise<Result<void>> {
  const streams = await ensureStreams(broker.jsm, address);
  return streams.ok ? ensureAdvisoryConsumer(broker.jsm, address) : streams;
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

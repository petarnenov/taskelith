import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  AuthorizationService,
  LoginThrottle,
  SessionService,
  type LoginThrottleSettings,
  type SessionLifetime,
} from '@taskelith/access';
import { parseLaunchParameters, type LaunchParametersInput } from '@taskelith/execution';
import { err, failure, instantFromEpochMilliseconds, ok, type Instant, type Result } from '@taskelith/kernel';
import {
  connectTransport,
  ensureAdvisoryConsumer,
  ensureObservationConsumer,
  ensureStreams,
  HeartbeatReceiver,
  INVENTORY_REPORTED,
  JetStreamPublisher,
  NatsCommandConsumers,
  observationConsumer,
  OutboxPublisher,
  Quarantine,
  runOutboxPublisher,
  runQuarantineKeeper,
  TransportAddress,
  TRANSPORT_LIMITS,
  type ControlPlaneConnection,
  type DeliveredMessage,
  type ReceivedHeartbeat,
  type TransportLimits,
} from '@taskelith/nats';
import { EventLoopLagMonitor, JsonLinesLogSink, runPeriodically, SYSTEM_CLOCK } from '@taskelith/node-observability';
import { LocalEvidenceVolume } from '@taskelith/evidence-volume';
import { InMemoryMetrics, Logger, sampleControlPlane, type LogSink } from '@taskelith/observability';
import { CommittingFleetRegistry, PostgresControlPlaneSignals, PostgresOutboxRelay } from '@taskelith/postgres';
import { Administration, START_OWNER_INVOCATION, type AdministrationSettings } from '../admin/administration.js';
import { createApiRequestListener, createTlsApiServer, type ApiServer } from '../api/api-server.js';
import { ControlPlaneApi } from '../api/control-plane-api.js';
import { ROUTES } from '../api/routes.js';
import { checkServerTls, type ServerTls } from '../api/server-tls.js';
import { DelegationService } from '../application/delegation-service.js';
import { EvidenceService } from '../application/evidence-service.js';
import { HEARTBEAT_QUEUE, HeartbeatService } from '../application/heartbeat-service.js';
import { LaunchAuthority } from '../application/launch-authority.js';
import { LostContactCheck } from '../application/lost-contact-check.js';
import { InventoryService } from '../application/inventory-service.js';
import { OBSERVATION_CONSUMER, ObservationService } from '../application/observation-service.js';
import { PlacementService } from '../application/placement-service.js';
import { RunService } from '../application/run-service.js';
import { TaskService } from '../application/task-service.js';
import { WorkflowRegistry, type KnownWorkflow } from '../application/workflow-registry.js';
import { repairCommandConsumers } from './command-consumer-repair.js';
import { requestStartInventories } from './start-inventory-requests.js';
import { InstallationPublicationFence } from './installation-publication-fence.js';
import { startAgentSessionServices } from './session-timeline.js';

// Provisional G2 values in docs/operational-targets.md, which G6 verifies.
export const GRACE_WINDOW_SWEEP_MILLISECONDS = 60_000;
export const PLACEMENT_PASS_MILLISECONDS = 5_000;
export const LOST_CONTACT_TIMEOUT_MILLISECONDS = 30_000;
export const LOST_CONTACT_CHECK_MILLISECONDS = 10_000;
// The launch ttl and skew of docs/operational-targets.md (provisional).
export const LAUNCH_PARAMETERS: LaunchParametersInput = Object.freeze({ ttlMilliseconds: 30_000, skewMilliseconds: 5_000 });
// How often ended and expired browser sessions are purged (provisional).
export const SESSION_PURGE_MILLISECONDS = 60_000;
// How long a stop waits for the loops before it cancels what still blocks.
export const SHUTDOWN_DEADLINE_MILLISECONDS = 30_000;
const CANCELLED_SETTLE_MILLISECONDS = 5_000;

// Loopback by default; served over HTTPS only (installation contract 7).
export interface ApiEndpoint {
  readonly host: string;
  readonly port: number;
}

// The browser endpoint: the operator's certificate, else the API's.
export interface BrowserEndpoint extends ApiEndpoint {
  readonly tls?: ServerTls;
}

export interface ControlPlaneSettings extends Omit<AdministrationSettings, 'logger' | 'metrics'> {
  readonly api: ApiEndpoint;
  readonly browser: BrowserEndpoint;
  readonly workflows: readonly KnownWorkflow[];
  readonly logSink?: LogSink;
  readonly sweepMilliseconds?: number;
  readonly placementMilliseconds?: number;
  readonly lostContactTimeoutMilliseconds?: number;
  readonly lostContactCheckMilliseconds?: number;
  readonly shutdownMilliseconds?: number;
  // The targets unless configured; tests pass shorter or smaller ones.
  readonly transportLimits?: TransportLimits;
  readonly launchParameters?: LaunchParametersInput;
  // Provisional values with documented defaults (Q6, Q8).
  readonly sessionLifetime?: SessionLifetime;
  readonly loginThrottle?: LoginThrottleSettings;
  readonly sessionPurgeMilliseconds?: number;
}

export interface RunningControlPlane {
  readonly api: ApiEndpoint;
  readonly browser: ApiEndpoint;
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
  const owner = await admin.value.ensureOwner(START_OWNER_INVOCATION);
  if (!owner.ok) return owner;
  const tls = listenerTls(admin.value, settings);
  if (!tls.ok) return tls;
  const installationCa = admin.value.installationCa();
  if (!installationCa.ok) return installationCa;
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
  const commandConsumers = new NatsCommandConsumers(broker.value.jsm, address.value, limits);
  const enrollment = await admin.value.enrollmentService(commandConsumers);
  if (!enrollment.ok) return enrollment;
  cleanup.push(() => enrollment.value.close());
  const database = admin.value.database;
  const registry = new CommittingFleetRegistry(database);
  await repairCommandConsumers(registry, commandConsumers, logger);
  const volume = LocalEvidenceVolume.open({ dataRoot: settings.dataRoot, ownerUid: settings.ownerUid });
  if (!volume.ok) return volume;
  const fence = new InstallationPublicationFence(database);
  const quarantine = new Quarantine(broker.value.jsm, broker.value.js, address.value, limits);
  const parameters = parseLaunchParameters(settings.launchParameters ?? LAUNCH_PARAMETERS);
  if (!parameters.ok) return parameters;
  const workflows = new WorkflowRegistry(settings.workflows);
  const launches = new LaunchAuthority(database, { workflows, parameters: parameters.value, newLaunchAuthId: () => `l${randomUUID()}` });
  const access = admin.value.access;
  const clock = { now: () => settings.now?.() ?? systemNow() };
  const sessions = new SessionService({
    ...access, random: access.secrets, clock,
    throttle: new LoginThrottle({ clock, sleep: (milliseconds) => sleep(milliseconds), ...(settings.loginThrottle === undefined ? {} : { settings: settings.loginThrottle }) }),
    ...(settings.sessionLifetime === undefined ? {} : { lifetime: settings.sessionLifetime }),
  });
  const runs = new RunService(database, workflows);
  const agentSessions = startAgentSessionServices(admin.value.namespace, database, clock);
  if (!agentSessions.ok) return agentSessions;
  const api = new ControlPlaneApi({
    runs,
    tasks: new TaskService(database),
    evidence: new EvidenceService(database, volume.value),
    delegations: new DelegationService(database),
    operator: admin.value.operatorPrincipal,
    sessions,
    authorization: new AuthorizationService(access.store),
    runProjects: { projectOf: (runId) => runs.projectOf(runId) },
    logger,
    enrollment: enrollment.value.service,
    launches,
    installationCa: installationCa.value,
    // A redrive publishes too, so it waits for the same fence.
    quarantine: { records: (from, limit) => quarantine.records(from, limit), redrive: (sequence) => fence.hold(() => quarantine.redrive(sequence)) },
    agentSessions: agentSessions.value,
  });
  // The session operations are served on the browser endpoint only, and a
  // secret only on the worker endpoint, under the installation CA.
  const workerRequests = createApiRequestListener(api, { logger, routes: ROUTES.filter((route) => !route.browserOnly) });
  const browserRequests = createApiRequestListener(api, { logger, routes: ROUTES.filter((route) => !route.confidential) });
  const servers = [createTlsApiServer(workerRequests, tls.value.worker), createTlsApiServer(browserRequests, tls.value.browser)];
  const closeApi = once(async () => {
    await Promise.all(servers.map((server) => close(server)));
  });
  cleanup.push(closeApi);
  const listening = await listen(servers[0]!, settings.api);
  if (!listening.ok) return listening;
  const browser = await listen(servers[1]!, settings.browser);
  if (!browser.ok) return browser;
  const controller = new AbortController();
  const lag = new EventLoopLagMonitor();
  cleanup.push(async () => lag.stop());
  const publisher = new OutboxPublisher(new PostgresOutboxRelay(database), new JetStreamPublisher(broker.value.js), address.value, { logger, limits, fence });
  const sweep = settings.sweepMilliseconds ?? GRACE_WINDOW_SWEEP_MILLISECONDS;
  const placement = new PlacementService(database, { now: Date.now, draw: Math.random });
  const placementPass = settings.placementMilliseconds ?? PLACEMENT_PASS_MILLISECONDS;
  const newRequestId = () => randomUUID();
  const services = {
    observations: new ObservationService(database, { newConfirmationId: () => `o${randomUUID()}`, newRequestId, logger }),
    inventory: new InventoryService(database, { newRequestId, logger }),
  };
  await requestStartInventories(registry, services.inventory, logger);
  const observations = observationConsumer(broker.value.js, address.value, OBSERVATION_CONSUMER,
    observationHandler(services, address.value), { limits, logger, metrics });
  const heartbeats = new HeartbeatReceiver({ connection: broker.value.connection, address: address.value, queue: HEARTBEAT_QUEUE },
    heartbeatHandler(new HeartbeatService(database), address.value), { logger });
  const lostContact = new LostContactCheck(database, { timeoutMilliseconds: settings.lostContactTimeoutMilliseconds ?? LOST_CONTACT_TIMEOUT_MILLISECONDS, logger });
  const lostContactCheck = settings.lostContactCheckMilliseconds ?? LOST_CONTACT_CHECK_MILLISECONDS;
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
    supervise('observations', observations.run(controller.signal)),
    supervise('heartbeats', heartbeats.run(controller.signal)),
    supervise('lost-contact', runPeriodically(async () => logFailure(logger, 'fleet.lost-contact.failed', await lostContact.markLost()), controller.signal, lostContactCheck)),
    supervise('placement', runPeriodically(async () => logFailure(logger, 'execution.placement.failed', await placement.placeWaiting()), controller.signal, placementPass)),
    supervise('sessions', runPeriodically(async () => logFailure(logger, 'access.sessions.purge.failed', await sessions.purgeExpired()), controller.signal,
      settings.sessionPurgeMilliseconds ?? SESSION_PURGE_MILLISECONDS)),
    supervise('sampler', runPeriodically(() => sampleControlPlane(new PostgresControlPlaneSignals(database), metrics, logger), controller.signal)),
    supervise('event-loop', runPeriodically(() => lag.sample(metrics), controller.signal)),
  ];
  logger.info('control-plane.started', {
    host: listening.value.host, port: listening.value.port, browserHost: browser.value.host, browserPort: browser.value.port,
  });
  return ok({ api: listening.value, browser: browser.value, metrics, stopped, stop });
}

const REISSUE = 'run make installation-certificates';
const setting = (variable: string) => ({ name: variable, details: { variable } });
const BROWSER_ORIGIN = { certificate: setting('TASKELITH_BROWSER_TLS_CERT'), key: setting('TASKELITH_BROWSER_TLS_KEY') };

interface ListenerTls {
  readonly worker: ServerTls;
  readonly browser: ServerTls;
}

// The worker API's installation certificate, and the operator's for the
// browser endpoint or else the same; both checked before any listen.
function listenerTls(admin: Administration, settings: ControlPlaneSettings): Result<ListenerTls> {
  const now = settings.now?.() ?? systemNow();
  const stored = admin.serverCertificate('api');
  if (!stored.ok) return stored;
  const installation = { certificate: stored.value.certificatePem, key: stored.value.privateKeyPem };
  const file = (path: string) => ({ name: path, details: { path } });
  const installationOrigin = { certificate: file(stored.value.path), key: file(stored.value.keyPath), remedy: REISSUE };
  const worker = checkServerTls(installation, installationOrigin, now);
  if (!worker.ok) return worker;
  if (settings.browser.tls === undefined) return ok({ worker: worker.value, browser: worker.value });
  const browser = checkServerTls(settings.browser.tls, BROWSER_ORIGIN, now);
  return browser.ok ? ok({ worker: worker.value, browser: browser.value }) : browser;
}

function systemNow(): Instant {
  const now = instantFromEpochMilliseconds(Date.now());
  if (!now.ok) throw new RangeError(now.error.message);
  return now.value;
}

function close(server: ApiServer): Promise<void> {
  return new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
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
  if (!streams.ok) return streams;
  const observations = await ensureObservationConsumer(broker.jsm, address, OBSERVATION_CONSUMER, limits);
  return observations.ok ? ensureAdvisoryConsumer(broker.jsm, address, limits) : observations;
}

interface ObservationServices {
  readonly observations: ObservationService;
  readonly inventory: InventoryService;
}

// The worker that the subject names authenticates the observation; an
// inventory report goes to its own service (21c decision 11).
function observationHandler(services: ObservationServices, address: TransportAddress) {
  return (message: DeliveredMessage) => {
    const observation = { subjectWorkerId: address.workerOfObservationSubject(message.subject), type: message.type, body: message.body };
    return message.type === INVENTORY_REPORTED ? services.inventory.apply(observation) : services.observations.apply(observation);
  };
}

function heartbeatHandler(service: HeartbeatService, address: TransportAddress) {
  return (heartbeat: ReceivedHeartbeat) => service.record({ subjectWorkerId: address.workerOfHeartbeatSubject(heartbeat.subject), body: heartbeat.body });
}

function listen(server: ApiServer, endpoint: ApiEndpoint): Promise<Result<ApiEndpoint>> {
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

import { randomUUID } from 'node:crypto';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@taskelith/contracts';
import type { JournalId, LaunchAuthorityClient } from '@taskelith/execution';
import { parseInstallationId, type Enrollment, type EnrollmentClient } from '@taskelith/fleet';
import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import {
  JetStreamPublisher,
  TransportAddress,
  workerCommandConsumer,
  type TransportConnection,
  type TransportLimits,
  type WorkerTransportEndpoint,
} from '@taskelith/nats';
import {
  claimWorkerRoot,
  failureReason,
  openWorkerRoot,
  readVolumeSpace,
  readWorkerCredentials,
  truncateBufferedLogs,
  workerPaths,
  type JournalClock,
  type VolumeProbe,
  type VolumeSpaceReader,
  type WorkerEnrollment,
  type WorkerIdentity,
  type WorkerRoot,
  type WorkerRootOptions,
} from '@taskelith/worker-journal';
import { AdmissionPressure, shedBufferedLogs } from './admission-pressure.js';
import { BrokerSession, type BrokerLink } from './broker-session.js';
import { CommandIntake } from './command-intake.js';
import type { DaemonOverheadSource } from './daemon-overhead.js';
import type { ContainmentScan, DeadlineClock, RecordListing, SupervisionFactory } from './execution-supervision-port.js';
import { runHeartbeats, type HeartbeatOptions } from './heartbeat-publisher.js';
import { reportInventoryOnConnection } from './inventory-report.js';
import { LaunchOrchestrator, openExecutions } from './launch-orchestrator.js';
import { runObservationPublisher } from './observation-publisher.js';
import type { WorkerSettings } from './settings.js';
import { runTogether, TaskGroup } from './task-group.js';
import { WorkerContact } from './worker-contact.js';

export interface WorkerDependencies {
  readonly enrollment: EnrollmentClient;
  readonly connect: (endpoint: WorkerTransportEndpoint) => Promise<Result<TransportConnection>>;
  readonly newJournalId: () => string;
  readonly clock: JournalClock;
  readonly probe?: VolumeProbe;
  // The free space of the data root's volume, for the disk floor.
  readonly space?: VolumeSpaceReader;
  // The daemon's memory and event-loop delay, for the daemon overhead.
  readonly daemon: DaemonOverheadSource;
  readonly pressurePollMilliseconds?: number;
  // Shorter transport timers for tests.
  readonly limits?: TransportLimits;
  // The broker retries, the heartbeats, and the lost-contact timer.
  readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly draw: () => number;
  // Reconciliation needs only the host; launches need a command too.
  readonly launching?: LaunchingDependencies;
  readonly logger?: Logger;
}

// What launches need beyond the journal: the launch authority with the
// worker's control-plane credential, and the supervision of one host.
export interface LaunchingDependencies {
  readonly authority: (credential: string) => LaunchAuthorityClient;
  readonly host: (settings: WorkerSettings, executions: string) => Result<LaunchHost>;
  readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly draw: () => number;
  readonly newId: () => string;
  readonly pollMilliseconds?: number;
  readonly logger?: Logger;
  readonly onFailure?: (error: unknown) => void;
}

export interface LaunchHost {
  readonly clock: DeadlineClock;
  readonly supervision: SupervisionFactory;
  readonly records?: RecordListing;
  readonly containments?: ContainmentScan;
}

// A started worker: it holds the root lock and keeps a broker connection,
// reads its commands, and publishes its observations; it listens on no port.
export interface RunningWorker {
  readonly identity: WorkerIdentity;
  readonly root: WorkerRoot;
  // Settles once the worker has stopped, by `stop` or by a runtime
  // failure, which `stop` rejects with; it may be called repeatedly.
  readonly stopped: Promise<void>;
  stop(): Promise<void>;
}

// Opens the enrolled root, or enrolls with the configured token first, then
// starts offline and connects to the broker with the stored credential.
export async function startWorker(settings: WorkerSettings, dependencies: WorkerDependencies): Promise<Result<RunningWorker>> {
  const options = rootOptions(settings, dependencies);
  const opened = openWorkerRoot(options);
  const root = !opened.ok && failureReason(opened.error) === 'not-enrolled' ? await enroll(settings, dependencies, options) : opened;
  if (!root.ok) return root;
  const started = startRuntime(settings, dependencies, root.value);
  if (!started.ok) root.value.close();
  return started;
}

// A journal write refused for lack of space sheds the buffered logs; the
// command is redelivered, and the watch derives the fact again.
function rootOptions(settings: WorkerSettings, dependencies: WorkerDependencies): WorkerRootOptions {
  const { clock, probe } = dependencies;
  const truncateLogs = () => truncateBufferedLogs(workerPaths(settings.dataRoot).logs);
  const onSpaceRefused = () => shedBufferedLogs(truncateLogs, dependencies.logger ?? SILENT_LOGGER);
  return { dataRoot: settings.dataRoot, clock, onSpaceRefused, ...(probe === undefined ? {} : { probe }) };
}

// The first start claims the root before it asks the control plane, so a
// root that cannot be created never spends the token.
async function enroll(settings: WorkerSettings, dependencies: WorkerDependencies, options: WorkerRootOptions): Promise<Result<WorkerRoot>> {
  const { enrollmentToken } = settings;
  if (enrollmentToken === undefined) {
    return err(failure('not-found', 'the worker is not enrolled; set TASKELITH_ENROLLMENT_TOKEN for its first start', {
      reason: 'not-enrolled', variable: 'TASKELITH_ENROLLMENT_TOKEN',
    }));
  }
  const claim = claimWorkerRoot(options);
  if (!claim.ok) return claim;
  try {
    const binding = await requestEnrollment(enrollmentToken, settings, dependencies);
    if (!binding.ok) claim.value.abandon();
    return binding.ok ? claim.value.complete(binding.value) : binding;
  } catch (error) {
    claim.value.abandon();
    throw error;
  }
}

async function requestEnrollment(token: string, settings: WorkerSettings, dependencies: WorkerDependencies): Promise<Result<WorkerEnrollment>> {
  const journalId = parseIdentifier('JournalId', dependencies.newJournalId());
  if (!journalId.ok) return journalId;
  const enrolled = await dependencies.enrollment.enroll(token, {
    journalId: journalId.value, host: settings.host, protocolVersions: SUPPORTED_PROTOCOL_VERSIONS, capacity: settings.capacity,
  });
  return enrolled.ok ? rootEnrollment(enrolled.value, journalId.value) : enrolled;
}

// The installation identifier becomes a subject token, so it is checked
// before the root exists.
function rootEnrollment(enrollment: Enrollment, journalId: JournalId): Result<WorkerEnrollment> {
  const installationId = parseInstallationId(enrollment.installationId);
  if (!installationId.ok) return installationId;
  const { workerId, recoveryEpoch, credentialGeneration, credentials } = enrollment;
  return ok({ installationId: installationId.value, workerId, journalId, recoveryEpoch, credentialGeneration, credentials });
}

// The launches, reconciliation, and pressure watch run at once; the
// broker's work runs while a connection is up.
function startRuntime(settings: WorkerSettings, dependencies: WorkerDependencies, root: WorkerRoot): Result<RunningWorker> {
  const { identity } = root;
  const credentials = readWorkerCredentials(root.paths, identity);
  if (!credentials.ok) return credentials;
  const address = TransportAddress.of(identity.installationId);
  if (!address.ok) return address;
  const subjects = workerSubjects(address.value, identity.workerId);
  if (!subjects.ok) return subjects;
  const controller = new AbortController();
  const tasks = new TaskGroup(controller.signal);
  const logger = dependencies.logger ?? SILENT_LOGGER;
  const contact = new WorkerContact({ sleep: dependencies.sleep, stopping: tasks.signal, logger });
  const pressure = admissionPressure(settings, dependencies, root);
  const credential = credentials.value.controlPlane;
  const launcher = launchOrchestrator({ settings, dependencies, root, credential, contact, pressure });
  if (!launcher.ok) return launcher;
  const declared = declareCapacity(settings, root);
  if (!declared.ok) return declared;
  const pressured = pressure.refresh();
  if (!pressured.ok) return pressured;
  const session = brokerSession({
    settings, dependencies, root, address: address.value, subjects: subjects.value, contact, pressure, broker: credentials.value.broker,
    ...(launcher.value === undefined ? {} : { launcher: launcher.value }),
  });
  tasks.add(session.run(tasks.signal));
  tasks.add(pressure.watch(tasks.signal, dependencies.pressurePollMilliseconds));
  tasks.add(dependencies.daemon.watch(tasks.signal));
  if (launcher.value !== undefined) tasks.add(launcher.value.run(tasks.signal));
  return ok(runningWorker(root, { finished: tasks.settled(), abort: () => controller.abort() }));
}

interface WorkerSubjects {
  readonly observations: string;
  readonly heartbeats: string;
}

function workerSubjects(address: TransportAddress, workerId: string): Result<WorkerSubjects> {
  const observations = address.observationSubject(workerId);
  if (!observations.ok) return observations;
  const heartbeats = address.heartbeatSubject(workerId);
  return heartbeats.ok ? ok({ observations: observations.value, heartbeats: heartbeats.value }) : heartbeats;
}

function admissionPressure(settings: WorkerSettings, dependencies: WorkerDependencies, root: WorkerRoot): AdmissionPressure {
  const space = dependencies.space ?? readVolumeSpace;
  return new AdmissionPressure({
    journal: root.journal, space: () => space(settings.dataRoot), daemon: dependencies.daemon,
    truncateLogs: () => truncateBufferedLogs(root.paths.logs),
    ...(dependencies.logger === undefined ? {} : { logger: dependencies.logger }),
  });
}

interface OrchestratorContext {
  readonly settings: WorkerSettings;
  readonly dependencies: WorkerDependencies;
  readonly root: WorkerRoot;
  readonly credential: string;
  readonly contact: WorkerContact;
  readonly pressure: AdmissionPressure;
}

// The host reconciles and removes records with or without a launch
// command; only a command adds the launch authority.
function launchOrchestrator(context: OrchestratorContext): Result<LaunchOrchestrator | undefined> {
  const { settings, dependencies, root, credential, contact, pressure } = context;
  const { launching } = dependencies;
  const logger = dependencies.logger ?? SILENT_LOGGER;
  if (launching === undefined) return deferReconciliation(root, logger, 'no supervision host');
  const host = launching.host(settings, root.paths.executions);
  if (!host.ok) return settings.launch === undefined ? deferReconciliation(root, logger, host.error.message) : host;
  const { sleep, draw, newId, pollMilliseconds, onFailure } = launching;
  const { supervision, clock, records, containments } = host.value;
  return ok(new LaunchOrchestrator({
    journal: root.journal, supervision, clock, pressure, sleep, draw, newId, contact,
    ...(settings.launch === undefined ? {} : { authority: launching.authority(credential) }),
    ...(pollMilliseconds === undefined ? {} : { pollMilliseconds }), ...(records === undefined ? {} : { records }),
    ...(containments === undefined ? {} : { containments }),
    ...(launching.logger === undefined ? {} : { logger: launching.logger }), ...(onFailure === undefined ? {} : { onFailure }),
  }));
}

// Without a supervision host nothing can be sealed or recovered, so the
// open executions wait, untouched, for a start that has one.
function deferReconciliation(root: WorkerRoot, logger: Logger, reason: string): Result<undefined> {
  const snapshot = root.journal.snapshot();
  if (!snapshot.ok) return snapshot;
  for (const executionId of openExecutions(snapshot.value)) logger.info('worker.reconciliation.deferred', { executionId, reason });
  return ok(undefined);
}

// Sorted, so a reordered configuration declares nothing new.
function declareCapacity(settings: WorkerSettings, root: WorkerRoot): Result<void> {
  const { controls, ...capacity } = settings.capacity;
  const enforceableControls = [...controls].sort();
  return root.journal.recordCapacity({ ...capacity, enforceableControls, protocolVersions: SUPPORTED_PROTOCOL_VERSIONS });
}

interface SessionContext {
  readonly settings: WorkerSettings;
  readonly dependencies: WorkerDependencies;
  readonly root: WorkerRoot;
  readonly address: TransportAddress;
  readonly subjects: WorkerSubjects;
  readonly contact: WorkerContact;
  readonly pressure: AdmissionPressure;
  readonly broker: string;
  readonly launcher?: LaunchOrchestrator;
}

interface TransportLink extends BrokerLink {
  readonly transport: TransportConnection;
}

function brokerSession(context: SessionContext): BrokerSession<TransportLink> {
  const { settings, dependencies, root, address, subjects, contact, broker } = context;
  const { sleep, draw, limits } = dependencies;
  const logger = dependencies.logger ?? SILENT_LOGGER;
  const endpoint = {
    server: settings.natsUrl, creds: broker, address, workerId: root.identity.workerId,
    ...(settings.natsTls === undefined ? {} : { tls: settings.natsTls }),
  };
  return new BrokerSession<TransportLink>({
    connect: async () => {
      const connected = await dependencies.connect(endpoint);
      return connected.ok ? ok(transportLink(connected.value)) : connected;
    },
    serve: (link, signal) => serveConnection(context, link.transport, signal),
    linkUp: (link, signal) => runTogether(signal, [
      (upSignal) => reportInventoryOnConnection({
        ...observationPublishing(context, link.transport), newReportId: randomUUID, sleep, draw, logger,
        ...(limits === undefined ? {} : { limits }),
      }, upSignal),
      (upSignal) => runHeartbeats(heartbeatOptions(context, link.transport), upSignal),
    ]),
    contact, sleep, draw, logger,
  });
}

function transportLink(transport: TransportConnection): TransportLink {
  return { transport, statuses: transport.connection.status(), close: () => transport.close() };
}

function observationPublishing(context: SessionContext, transport: TransportConnection) {
  const publisher = new JetStreamPublisher(transport.js);
  const { journal } = context.root;
  return {
    journal, publish: publisher.publish.bind(publisher), observationSubject: context.subjects.observations,
    now: () => context.dependencies.clock.now(), journalFault: () => journal.fault,
  };
}

// The command consumer and the observation publisher of one connection,
// until its signal aborts.
async function serveConnection(context: SessionContext, transport: TransportConnection, signal: AbortSignal): Promise<void> {
  const { settings, dependencies, root, address, launcher } = context;
  const publishing = observationPublishing(context, transport);
  const intake = new CommandIntake({
    ...publishing, capacity: settings.capacity, pressure: context.pressure, newReportId: randomUUID,
    ...(launcher === undefined ? {} : { onRecorded: launcher.notify }),
  });
  const options = dependencies.limits === undefined ? {} : { limits: dependencies.limits };
  const consumer = workerCommandConsumer(transport.js, address, root.identity.workerId, intake.handle, options);
  await runTogether(signal, [
    (served) => consumer.run(served),
    (served) => runObservationPublisher(publishing, served, dependencies.limits),
  ]);
}

// Restarted on each link-up, so a reconnect sends one at once; a stopped
// journal stops them, as it stops every publication.
function heartbeatOptions(context: SessionContext, transport: TransportConnection): HeartbeatOptions {
  const { dependencies, root, subjects, contact } = context;
  const canSend = () => contact.connected && root.journal.fault === undefined;
  return {
    binding: root.identity, subject: subjects.heartbeats, send: coreSender(transport), canSend,
    now: () => dependencies.clock.now(), sleep: dependencies.sleep,
    ...(dependencies.logger === undefined ? {} : { logger: dependencies.logger }),
  };
}

// Core NATS publishes without an acknowledgement; a throw loses only this
// message.
function coreSender(transport: TransportConnection): (subject: string, body: Uint8Array) => Result<void> {
  return (subject, body) => {
    try {
      transport.connection.publish(subject, body);
      return ok(undefined);
    } catch (error) {
      return err(failure('unavailable', `the broker refused a publication: ${(error as Error).message}`));
    }
  };
}

interface Runtime {
  readonly finished: Promise<void>;
  abort(): void;
}

function runningWorker(root: WorkerRoot, runtime: Runtime): RunningWorker {
  const closed = closeAfter(root, runtime.finished);
  const stopped = closed.catch(() => undefined);
  const stop = () => {
    runtime.abort();
    return closed;
  };
  return Object.freeze({ identity: root.identity, root, stopped, stop });
}

// Every task of the runtime ended, after a stop or a failure; the journal
// they use closes last.
async function closeAfter(root: WorkerRoot, finished: Promise<void>): Promise<void> {
  try {
    await finished;
  } finally {
    root.close();
  }
}

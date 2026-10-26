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
import { CommandIntake } from './command-intake.js';
import type { DaemonOverheadSource } from './daemon-overhead.js';
import type { DeadlineClock, RecordListing, SupervisionFactory } from './execution-supervision-port.js';
import { LaunchOrchestrator, openExecutions } from './launch-orchestrator.js';
import { runObservationPublisher } from './observation-publisher.js';
import type { LaunchSettings, WorkerSettings } from './settings.js';

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
  // Used only when the settings name a launch command.
  readonly launching?: LaunchingDependencies;
  readonly logger?: Logger;
}

// What launches need beyond the journal: the launch authority with the
// worker's control-plane credential, and the supervision of one host.
export interface LaunchingDependencies {
  readonly authority: (credential: string) => LaunchAuthorityClient;
  readonly host: (launch: LaunchSettings, executions: string) => Result<LaunchHost>;
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
}

// A started worker: it holds the root lock and its broker connection, reads
// its commands, and publishes its observations; it listens on no port.
export interface RunningWorker {
  readonly identity: WorkerIdentity;
  readonly root: WorkerRoot;
  readonly transport: TransportConnection;
  // Settles once the worker has stopped; `stop` may be called repeatedly.
  readonly stopped: Promise<void>;
  stop(): Promise<void>;
}

// Opens the enrolled root, or enrolls with the configured token first, then
// connects to the broker with the stored broker credential.
export async function startWorker(settings: WorkerSettings, dependencies: WorkerDependencies): Promise<Result<RunningWorker>> {
  const options = rootOptions(settings, dependencies);
  const opened = openWorkerRoot(options);
  const root = !opened.ok && failureReason(opened.error) === 'not-enrolled' ? await enroll(settings, dependencies, options) : opened;
  if (!root.ok) return root;
  const connected = await connectBroker(settings, dependencies, root.value);
  if (!connected.ok) root.value.close();
  return connected;
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

async function connectBroker(settings: WorkerSettings, dependencies: WorkerDependencies, root: WorkerRoot): Promise<Result<RunningWorker>> {
  const { identity } = root;
  const credentials = readWorkerCredentials(root.paths, identity);
  if (!credentials.ok) return credentials;
  const address = TransportAddress.of(identity.installationId);
  if (!address.ok) return address;
  const observationSubject = address.value.observationSubject(identity.workerId);
  if (!observationSubject.ok) return observationSubject;
  const pressure = admissionPressure(settings, dependencies, root);
  const launcher = launchOrchestrator(settings, dependencies, root, credentials.value.controlPlane, pressure);
  if (!launcher.ok) return launcher;
  if (launcher.value === undefined) {
    const deferred = deferReconciliation(root, dependencies.logger ?? SILENT_LOGGER);
    if (!deferred.ok) return deferred;
  }
  const declared = declareCapacity(settings, root);
  if (!declared.ok) return declared;
  const pressured = pressure.refresh();
  if (!pressured.ok) return pressured;
  const transport = await dependencies.connect({
    server: settings.natsUrl, creds: credentials.value.broker, address: address.value, workerId: identity.workerId,
    ...(settings.natsTls === undefined ? {} : { tls: settings.natsTls }),
  });
  if (!transport.ok) return transport;
  const loops = startLoops({
    settings, dependencies, root, transport: transport.value, address: address.value, observationSubject: observationSubject.value, pressure,
    ...(launcher.value === undefined ? {} : { launcher: launcher.value }),
  });
  return ok(runningWorker(root, transport.value, loops));
}

function admissionPressure(settings: WorkerSettings, dependencies: WorkerDependencies, root: WorkerRoot): AdmissionPressure {
  const space = dependencies.space ?? readVolumeSpace;
  return new AdmissionPressure({
    journal: root.journal, space: () => space(settings.dataRoot), daemon: dependencies.daemon,
    truncateLogs: () => truncateBufferedLogs(root.paths.logs),
    ...(dependencies.logger === undefined ? {} : { logger: dependencies.logger }),
  });
}

// Only a worker whose settings name a launch command launches anything.
function launchOrchestrator(
  settings: WorkerSettings,
  dependencies: WorkerDependencies,
  root: WorkerRoot,
  credential: string,
  pressure: AdmissionPressure,
): Result<LaunchOrchestrator | undefined> {
  const { launch } = settings;
  const { launching } = dependencies;
  if (launch === undefined || launching === undefined) return ok(undefined);
  const host = launching.host(launch, root.paths.executions);
  if (!host.ok) return host;
  const { sleep, draw, newId, pollMilliseconds, logger, onFailure } = launching;
  const { supervision, clock, records } = host.value;
  return ok(new LaunchOrchestrator({
    journal: root.journal, authority: launching.authority(credential), supervision, clock, pressure, sleep, draw, newId,
    ...(pollMilliseconds === undefined ? {} : { pollMilliseconds }), ...(records === undefined ? {} : { records }),
    ...(logger === undefined ? {} : { logger }), ...(onFailure === undefined ? {} : { onFailure }),
  }));
}

// Without a launch host nothing can be sealed, so the open executions wait,
// untouched, for a start that names a launch command.
function deferReconciliation(root: WorkerRoot, logger: Logger): Result<void> {
  const snapshot = root.journal.snapshot();
  if (!snapshot.ok) return snapshot;
  for (const executionId of openExecutions(snapshot.value)) logger.info('worker.reconciliation.deferred', { executionId });
  return ok(undefined);
}

// Sorted, so a reordered configuration declares nothing new.
function declareCapacity(settings: WorkerSettings, root: WorkerRoot): Result<void> {
  const { controls, ...capacity } = settings.capacity;
  const enforceableControls = [...controls].sort();
  return root.journal.recordCapacity({ ...capacity, enforceableControls, protocolVersions: SUPPORTED_PROTOCOL_VERSIONS });
}

interface LoopContext {
  readonly settings: WorkerSettings;
  readonly dependencies: WorkerDependencies;
  readonly root: WorkerRoot;
  readonly transport: TransportConnection;
  readonly address: TransportAddress;
  readonly observationSubject: string;
  readonly pressure: AdmissionPressure;
  readonly launcher?: LaunchOrchestrator;
}

interface Loops {
  readonly finished: Promise<void>;
  abort(): void;
}

// The command consumer, the observation publisher, the pressure watch and
// its sensor, and the launches, until aborted.
function startLoops(context: LoopContext): Loops {
  const { settings, dependencies, root, transport, address, observationSubject, pressure, launcher } = context;
  const { journal } = root;
  const publisher = new JetStreamPublisher(transport.js);
  const publish = publisher.publish.bind(publisher);
  const now = () => dependencies.clock.now();
  const intake = new CommandIntake({
    journal, capacity: settings.capacity, pressure, publish, observationSubject, newReportId: randomUUID, now,
    ...(launcher === undefined ? {} : { onRecorded: launcher.notify }),
  });
  const options = dependencies.limits === undefined ? {} : { limits: dependencies.limits };
  const consumer = workerCommandConsumer(transport.js, address, root.identity.workerId, intake.handle, options);
  const controller = new AbortController();
  const finished = Promise.all([
    consumer.run(controller.signal),
    runObservationPublisher({ journal, publish, observationSubject, now }, controller.signal, dependencies.limits),
    pressure.watch(controller.signal, dependencies.pressurePollMilliseconds),
    dependencies.daemon.watch(controller.signal),
    launcher?.run(controller.signal),
  ]).then(() => undefined);
  return { finished, abort: () => controller.abort() };
}

function runningWorker(root: WorkerRoot, transport: TransportConnection, loops: Loops): RunningWorker {
  let finish: () => void = () => undefined;
  const stopped = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let stopping: Promise<void> | undefined;
  const stop = () => {
    stopping ??= closeAll(root, transport, loops).finally(finish);
    return stopping;
  };
  return Object.freeze({ identity: root.identity, root, transport, stopped, stop });
}

// The loops stop before the connection and the journal they use close.
async function closeAll(root: WorkerRoot, transport: TransportConnection, loops: Loops): Promise<void> {
  loops.abort();
  try {
    await loops.finished.finally(() => transport.close());
  } finally {
    root.close();
  }
}

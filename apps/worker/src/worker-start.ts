import { randomUUID } from 'node:crypto';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@taskelith/contracts';
import type { DeclaredCapacity, JournalId, LaunchAuthorityClient } from '@taskelith/execution';
import {
  parseInstallationId,
  type Enrollment,
  type CredentialRenewalClient,
  type EnrollmentClient,
  type InstallationCaSource,
  type StartFacts,
  type WorkerAdmissionCheck,
} from '@taskelith/fleet';
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
  readInstallationCaPin,
  readVolumeSpace,
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
import { BrokerDial } from './broker-dial.js';
import { CommandIntake } from './command-intake.js';
import { CredentialRotation } from './credential-rotation.js';
import type { DaemonOverheadSource } from './daemon-overhead.js';
import type { ContainmentScan, DeadlineClock, RecordListing, SupervisionFactory } from './execution-supervision-port.js';
import { runHeartbeats, type HeartbeatOptions } from './heartbeat-publisher.js';
import { reportInventoryOnConnection } from './inventory-report.js';
import { LaunchOrchestrator, openExecutions } from './launch-orchestrator.js';
import { runObservationPublisher } from './observation-publisher.js';
import { checkComposition, hasFailedCheck, runSelfCheck } from './self-check.js';
import type { WorkerSettings } from './settings.js';
import { runTogether, TaskGroup } from './task-group.js';
import { WorkerContact } from './worker-contact.js';
import type { WorkerWorkspace } from './workspace-composition.js';
import { WorkspaceSlots } from './workspace-slots.js';

export interface WorkerDependencies {
  // Reads the CA before the token is sent; enrollment then pins it.
  readonly installationCa: InstallationCaSource;
  readonly enrollment: (installationCa: string) => EnrollmentClient;
  // Renews and confirms the worker's credential generations.
  readonly renewal: (installationCa: string) => CredentialRenewalClient;
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
  // The worker admission checks of every start (worker admission contract).
  readonly admissionChecks: readonly WorkerAdmissionCheck[];
  // The Git workspace and its start preconditions; undefined composes none.
  readonly workspace?: (settings: WorkerSettings) => Promise<Result<WorkerWorkspace | undefined>>;
}

// What launches need beyond the journal: the launch authority with the
// worker's current bearer and pinned CA, and the supervision.
export interface LaunchingDependencies {
  readonly authority: (bearer: () => string, installationCa: string) => LaunchAuthorityClient;
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
  // The handed-off workspaces' slots, where the worker holds workspaces.
  readonly workspaceSlots?: WorkspaceSlots;
  // Settles once the worker has stopped, by `stop` or by a runtime
  // failure, which `stop` rejects with; it may be called repeatedly.
  readonly stopped: Promise<void>;
  stop(): Promise<void>;
}

// Opens the enrolled root, or enrolls with the configured token first, then
// starts offline and connects to the broker with the stored credential.
export async function startWorker(settings: WorkerSettings, dependencies: WorkerDependencies): Promise<Result<RunningWorker>> {
  const composed = checkComposition(dependencies.admissionChecks);
  if (!composed.ok) return composed;
  const workspace = (await dependencies.workspace?.(settings)) ?? ok(undefined);
  if (!workspace.ok) return workspace;
  const options = rootOptions(settings, dependencies);
  const opened = openWorkerRoot(options);
  const root = !opened.ok && failureReason(opened.error) === 'not-enrolled' ? await enroll(settings, dependencies, options) : opened;
  if (!root.ok) return root;
  const started = await startRuntime(settings, dependencies, root.value, workspace.value);
  if (!started.ok) root.value.close();
  return started;
}

// A journal write refused for lack of space sheds the buffered logs; the
// command is redelivered, and the watch derives the fact again.
function rootOptions(settings: WorkerSettings, dependencies: WorkerDependencies): WorkerRootOptions {
  const { clock, probe } = dependencies;
  const truncateLogs = () => truncateBufferedLogs(workerPaths(settings.dataRoot).logs);
  const onSpaceRefused = () => shedBufferedLogs(truncateLogs, dependencies.logger ?? SILENT_LOGGER);
  // The group may traverse to the workspaces (Git workspace contract sec. 2).
  const executionGroup = settings.launch?.executionAccount?.gid;
  return {
    dataRoot: settings.dataRoot, clock, onSpaceRefused,
    ...(probe === undefined ? {} : { probe }), ...(executionGroup === undefined ? {} : { executionGroup }),
  };
}

// The first start claims the root before it asks the control plane, so a
// root that cannot be created never spends the token.
async function enroll(settings: WorkerSettings, dependencies: WorkerDependencies, options: WorkerRootOptions): Promise<Result<WorkerRoot>> {
  const { enrollmentToken, installationCaSha256 } = settings;
  if (enrollmentToken === undefined) {
    return err(failure('not-found', 'the worker is not enrolled; set TASKELITH_ENROLLMENT_TOKEN for its first start', {
      reason: 'not-enrolled', variable: 'TASKELITH_ENROLLMENT_TOKEN',
    }));
  }
  if (installationCaSha256 === undefined) {
    return err(failure('invalid', 'set TASKELITH_INSTALLATION_CA_SHA256 from the enrollment bundle for the first start', {
      variable: 'TASKELITH_INSTALLATION_CA_SHA256',
    }));
  }
  const claim = claimWorkerRoot(options);
  if (!claim.ok) return claim;
  try {
    const binding = await requestEnrollment({ token: enrollmentToken, installationCaSha256 }, settings, dependencies);
    if (!binding.ok) claim.value.abandon();
    return binding.ok ? claim.value.complete(binding.value) : binding;
  } catch (error) {
    claim.value.abandon();
    throw error;
  }
}

// The token and the fingerprint of the operator's enrollment bundle.
interface EnrollmentBundle {
  readonly token: string;
  readonly installationCaSha256: string;
}

// The token goes only to a server that TLS pinned to the checked CA.
async function requestEnrollment(bundle: EnrollmentBundle, settings: WorkerSettings, dependencies: WorkerDependencies): Promise<Result<WorkerEnrollment>> {
  const installationCa = await checkedInstallationCa(dependencies.installationCa, bundle.installationCaSha256);
  if (!installationCa.ok) return installationCa;
  const journalId = parseIdentifier('JournalId', dependencies.newJournalId());
  if (!journalId.ok) return journalId;
  const enrolled = await dependencies.enrollment(installationCa.value).enroll(bundle.token, {
    journalId: journalId.value, host: settings.host, protocolVersions: SUPPORTED_PROTOCOL_VERSIONS, capacity: settings.capacity,
  });
  return enrolled.ok ? rootEnrollment(enrolled.value, journalId.value, installationCa.value) : enrolled;
}

// No trust on first use: only the fingerprint handed over out of band
// makes the CA, read over unverified TLS, trusted.
async function checkedInstallationCa(source: InstallationCaSource, expectedSha256: string): Promise<Result<string>> {
  const read = await source.read();
  if (!read.ok) return read;
  if (read.value.sha256 === expectedSha256) return ok(read.value.certificatePem);
  return err(failure('precondition-failed', 'the installation CA does not match TASKELITH_INSTALLATION_CA_SHA256; no token was sent', {
    reason: 'installation-ca-mismatch', variable: 'TASKELITH_INSTALLATION_CA_SHA256',
  }));
}

// The installation identifier becomes a subject token, so it is checked
// before the root exists.
function rootEnrollment(enrollment: Enrollment, journalId: JournalId, installationCa: string): Result<WorkerEnrollment> {
  const installationId = parseInstallationId(enrollment.installationId);
  if (!installationId.ok) return installationId;
  const { workerId, recoveryEpoch, credentialGeneration, credentials } = enrollment;
  return ok({ installationId: installationId.value, workerId, journalId, recoveryEpoch, credentialGeneration, credentials, installationCa });
}

// The launches, reconciliation, and pressure watch run at once; the
// broker's work runs while a connection is up.
async function startRuntime(
  settings: WorkerSettings,
  dependencies: WorkerDependencies,
  root: WorkerRoot,
  workspace: WorkerWorkspace | undefined,
): Promise<Result<RunningWorker>> {
  const { identity } = root;
  const installationCa = readInstallationCaPin(root.paths);
  if (!installationCa.ok) return installationCa;
  let session: BrokerSession<TransportLink> | undefined;
  const rotation = CredentialRotation.open({
    paths: root.paths, identity, renewal: dependencies.renewal(installationCa.value), redial: () => session?.redial(),
    sleep: dependencies.sleep, draw: dependencies.draw, ...(dependencies.logger === undefined ? {} : { logger: dependencies.logger }),
  });
  if (!rotation.ok) return rotation;
  const address = TransportAddress.of(identity.installationId);
  if (!address.ok) return address;
  const subjects = workerSubjects(address.value, identity.workerId);
  if (!subjects.ok) return subjects;
  const controller = new AbortController();
  const tasks = new TaskGroup(controller.signal);
  const logger = dependencies.logger ?? SILENT_LOGGER;
  const contact = new WorkerContact({ sleep: dependencies.sleep, stopping: tasks.signal, logger });
  const pressure = admissionPressure(settings, dependencies, root);
  const selfCheck = await runSelfCheck(dependencies.admissionChecks, startFacts(settings));
  if (!selfCheck.ok) return selfCheck;
  const selfCheckFailed = hasFailedCheck(selfCheck.value);
  const slots = await openWorkspaceSlots(workspace, settings, root, logger);
  if (!slots.ok) return slots;
  const bearer = rotation.value.bearer;
  const launcher = launchOrchestrator({
    settings, dependencies, root, bearer, installationCa: installationCa.value, contact, pressure, selfCheckFailed, slots: slots.value,
  });
  if (!launcher.ok) return launcher;
  const declared = declareCapacity(settings, root);
  if (!declared.ok) return declared;
  const pressured = pressure.refresh();
  if (!pressured.ok) return pressured;
  const reported = root.journal.recordSelfCheck(selfCheck.value);
  if (!reported.ok) return reported;
  session = brokerSession({
    settings, dependencies, root, address: address.value, subjects: subjects.value, contact, pressure, rotation: rotation.value,
    installationCa: installationCa.value, selfCheckFailed, ...(launcher.value === undefined ? {} : { launcher: launcher.value }),
    ...(slots.value === undefined ? {} : { slots: slots.value }),
  });
  tasks.add(session.run(tasks.signal));
  tasks.add(rotation.value.run(tasks.signal));
  tasks.add(pressure.watch(tasks.signal, dependencies.pressurePollMilliseconds));
  tasks.add(dependencies.daemon.watch(tasks.signal));
  if (launcher.value !== undefined) tasks.add(launcher.value.run(tasks.signal));
  return ok(runningWorker(root, { finished: tasks.settled(), abort: () => controller.abort() }, slots.value));
}

// Section 3 of the Git workspace contract: the sweep before any prepare,
// then the held slots from the hand-off records; a fault fails the start.
async function openWorkspaceSlots(
  workspace: WorkerWorkspace | undefined,
  settings: WorkerSettings,
  root: WorkerRoot,
  logger: Logger,
): Promise<Result<WorkspaceSlots | undefined>> {
  if (workspace === undefined) return ok(undefined);
  try {
    await workspace.sweep();
  } catch (error) {
    return err(failure('unavailable', `the workspaces cannot be swept: ${(error as Error).message}`));
  }
  const redeclareCapacity = () => root.journal.redeclareCapacity(declaredCapacity(settings));
  return WorkspaceSlots.open({ workspace, redeclareCapacity, logger });
}

// Only the platform and the launch command decide that a check does not
// apply at this start.
function startFacts(settings: WorkerSettings): StartFacts {
  return { platform: settings.host.platform, launchCommand: settings.launch !== undefined };
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
  readonly bearer: () => string;
  readonly installationCa: string;
  readonly contact: WorkerContact;
  readonly pressure: AdmissionPressure;
  readonly selfCheckFailed: boolean;
  readonly slots: WorkspaceSlots | undefined;
}

// The host reconciles and removes records with or without a launch
// command; only a command and a passed self-check add the launch authority.
function launchOrchestrator(context: OrchestratorContext): Result<LaunchOrchestrator | undefined> {
  const { settings, dependencies, root, bearer, installationCa, contact, pressure, selfCheckFailed, slots } = context;
  const { launching } = dependencies;
  const logger = dependencies.logger ?? SILENT_LOGGER;
  if (launching === undefined) return deferReconciliation(root, logger, 'no supervision host');
  const host = launching.host(settings, root.paths.executions);
  if (!host.ok) return settings.launch === undefined ? deferReconciliation(root, logger, host.error.message) : host;
  const { sleep, draw, newId, pollMilliseconds, onFailure } = launching;
  const { supervision, clock, records } = host.value;
  const containments = skippingRecorded(host.value.containments, slots?.recordedContainments);
  return ok(new LaunchOrchestrator({
    journal: root.journal, supervision, clock, pressure, sleep, draw, newId, contact,
    ...(settings.launch === undefined || selfCheckFailed ? {} : { authority: launching.authority(bearer, installationCa) }),
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

// A reclaim program's containment that a hand-off record names is no
// unrecorded process (Git workspace contract section 3, step 7).
function skippingRecorded(scan: ContainmentScan | undefined, recorded: ReadonlySet<string> | undefined): ContainmentScan | undefined {
  if (scan === undefined || recorded === undefined) return scan;
  return () => {
    const found = scan();
    return found.ok ? ok(found.value.filter(({ name }) => !recorded.has(name))) : found;
  };
}

function declareCapacity(settings: WorkerSettings, root: WorkerRoot): Result<void> {
  return root.journal.recordCapacity(declaredCapacity(settings));
}

// Sorted, so a reordered configuration declares nothing new.
function declaredCapacity(settings: WorkerSettings): DeclaredCapacity {
  const { controls, ...capacity } = settings.capacity;
  const enforceableControls = [...controls].sort();
  return { ...capacity, enforceableControls, protocolVersions: SUPPORTED_PROTOCOL_VERSIONS };
}

interface SessionContext {
  readonly settings: WorkerSettings;
  readonly dependencies: WorkerDependencies;
  readonly root: WorkerRoot;
  readonly address: TransportAddress;
  readonly subjects: WorkerSubjects;
  readonly contact: WorkerContact;
  readonly pressure: AdmissionPressure;
  readonly rotation: CredentialRotation;
  readonly installationCa: string;
  readonly selfCheckFailed: boolean;
  readonly launcher?: LaunchOrchestrator;
  readonly slots?: WorkspaceSlots;
}

interface TransportLink extends BrokerLink {
  readonly transport: TransportConnection;
  readonly generation: number;
}

function brokerSession(context: SessionContext): BrokerSession<TransportLink> {
  const { settings, dependencies, root, address, subjects, contact, rotation, installationCa } = context;
  const { sleep, draw, limits } = dependencies;
  const logger = dependencies.logger ?? SILENT_LOGGER;
  // The pinned CA is the broker TLS's only CA, never the system's.
  const endpoint = { server: settings.natsUrl, address, workerId: root.identity.workerId, tls: { ca: installationCa } };
  const dial = new BrokerDial({ candidates: () => rotation.brokerCandidates(), dial: (creds) => dependencies.connect({ ...endpoint, creds }), logger });
  return new BrokerSession<TransportLink>({
    connect: async () => {
      const connected = await dial.connect();
      if (!connected.ok) return connected;
      rotation.linked(connected.value.generation);
      return ok(transportLink(connected.value.link, connected.value.generation));
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

function transportLink(transport: TransportConnection, generation: number): TransportLink {
  return { transport, generation, statuses: transport.connection.status(), close: () => transport.close() };
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
  const { settings, dependencies, root, address, launcher, slots } = context;
  const publishing = observationPublishing(context, transport);
  const intake = new CommandIntake({
    ...publishing, capacity: settings.capacity, pressure: context.pressure, selfCheckFailed: context.selfCheckFailed, newReportId: randomUUID,
    ...(slots === undefined ? {} : { handedOff: () => slots.held }),
    onRotationRequested: context.rotation.requested, ...(launcher === undefined ? {} : { onRecorded: launcher.notify }),
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

function runningWorker(root: WorkerRoot, runtime: Runtime, workspaceSlots: WorkspaceSlots | undefined): RunningWorker {
  const closed = closeAfter(root, runtime.finished);
  const stopped = closed.catch(() => undefined);
  const stop = () => {
    runtime.abort();
    return closed;
  };
  return Object.freeze({ identity: root.identity, root, stopped, stop, ...(workspaceSlots === undefined ? {} : { workspaceSlots }) });
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

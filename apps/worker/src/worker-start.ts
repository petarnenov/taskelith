import { randomUUID } from 'node:crypto';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@taskelith/contracts';
import type { JournalId } from '@taskelith/execution';
import { parseInstallationId, type Enrollment, type EnrollmentClient } from '@taskelith/fleet';
import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
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
  readWorkerCredentials,
  type JournalClock,
  type VolumeProbe,
  type WorkerEnrollment,
  type WorkerIdentity,
  type WorkerRoot,
  type WorkerRootOptions,
} from '@taskelith/worker-journal';
import { CommandIntake } from './command-intake.js';
import { runObservationPublisher } from './observation-publisher.js';
import type { WorkerSettings } from './settings.js';

export interface WorkerDependencies {
  readonly enrollment: EnrollmentClient;
  readonly connect: (endpoint: WorkerTransportEndpoint) => Promise<Result<TransportConnection>>;
  readonly newJournalId: () => string;
  readonly clock: JournalClock;
  readonly probe?: VolumeProbe;
  // Shorter transport timers for tests.
  readonly limits?: TransportLimits;
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

function rootOptions(settings: WorkerSettings, dependencies: WorkerDependencies): WorkerRootOptions {
  const { clock, probe } = dependencies;
  return { dataRoot: settings.dataRoot, clock, ...(probe === undefined ? {} : { probe }) };
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
  const declared = declareCapacity(settings, root);
  if (!declared.ok) return declared;
  const transport = await dependencies.connect({
    server: settings.natsUrl, creds: credentials.value.broker, address: address.value, workerId: identity.workerId,
    ...(settings.natsTls === undefined ? {} : { tls: settings.natsTls }),
  });
  if (!transport.ok) return transport;
  const loops = startLoops({ settings, dependencies, root, transport: transport.value, address: address.value, observationSubject: observationSubject.value });
  return ok(runningWorker(root, transport.value, loops));
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
}

interface Loops {
  readonly finished: Promise<void>;
  abort(): void;
}

// The command consumer and the observation publisher, until aborted.
function startLoops(context: LoopContext): Loops {
  const { settings, dependencies, root, transport, address, observationSubject } = context;
  const { journal } = root;
  const publisher = new JetStreamPublisher(transport.js);
  const publish = publisher.publish.bind(publisher);
  const now = () => dependencies.clock.now();
  const intake = new CommandIntake({
    journal, capacity: settings.capacity, publish, observationSubject, newReportId: randomUUID, now,
  });
  const options = dependencies.limits === undefined ? {} : { limits: dependencies.limits };
  const consumer = workerCommandConsumer(transport.js, address, root.identity.workerId, intake.handle, options);
  const controller = new AbortController();
  const finished = Promise.all([
    consumer.run(controller.signal),
    runObservationPublisher({ journal, publish, observationSubject, now }, controller.signal, dependencies.limits),
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

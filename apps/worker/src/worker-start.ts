import { SUPPORTED_PROTOCOL_VERSIONS } from '@taskelith/contracts';
import { parseInstallationId, type EnrollmentClient } from '@taskelith/fleet';
import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import { TransportAddress, type TransportConnection, type WorkerTransportEndpoint } from '@taskelith/nats';
import {
  enrollWorkerRoot,
  failureReason,
  openWorkerRoot,
  readWorkerCredentials,
  type JournalClock,
  type VolumeProbe,
  type WorkerIdentity,
  type WorkerRoot,
  type WorkerRootOptions,
} from '@taskelith/worker-journal';
import type { WorkerSettings } from './settings.js';

export interface WorkerDependencies {
  readonly enrollment: EnrollmentClient;
  readonly connect: (endpoint: WorkerTransportEndpoint) => Promise<Result<TransportConnection>>;
  readonly newJournalId: () => string;
  readonly clock: JournalClock;
  readonly ownerUid: number;
  readonly probe?: VolumeProbe;
}

// A started worker: it holds the root lock and its broker connection, and
// listens on no port, since every connection is outbound.
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

// The first start: a new journal identity is enrolled, then the root is
// created with the returned binding and credentials.
async function enroll(settings: WorkerSettings, dependencies: WorkerDependencies, options: WorkerRootOptions): Promise<Result<WorkerRoot>> {
  const { enrollmentToken } = settings;
  if (enrollmentToken === undefined) {
    return err(failure('not-found', 'the worker is not enrolled; set TASKELITH_ENROLLMENT_TOKEN for its first start', {
      reason: 'not-enrolled', variable: 'TASKELITH_ENROLLMENT_TOKEN',
    }));
  }
  const journalId = parseIdentifier('JournalId', dependencies.newJournalId());
  if (!journalId.ok) return journalId;
  const enrolled = await dependencies.enrollment.enroll(enrollmentToken, {
    journalId: journalId.value, host: settings.host, protocolVersions: SUPPORTED_PROTOCOL_VERSIONS, capacity: settings.capacity,
  });
  if (!enrolled.ok) return enrolled;
  const { installationId, workerId, recoveryEpoch, credentialGeneration, credentials } = enrolled.value;
  // It becomes a subject token, so it is checked before the root exists.
  const installation = parseInstallationId(installationId);
  if (!installation.ok) return installation;
  return enrollWorkerRoot(options, {
    installationId: installation.value, workerId, journalId: journalId.value, recoveryEpoch, credentialGeneration, credentials,
  });
}

async function connectBroker(settings: WorkerSettings, dependencies: WorkerDependencies, root: WorkerRoot): Promise<Result<RunningWorker>> {
  const { identity } = root;
  const credentials = readWorkerCredentials(root.paths, identity, dependencies.ownerUid);
  if (!credentials.ok) return credentials;
  const address = TransportAddress.of(identity.installationId);
  if (!address.ok) return address;
  const transport = await dependencies.connect({
    server: settings.natsUrl, creds: credentials.value.broker, address: address.value, workerId: identity.workerId,
    ...(settings.natsTls === undefined ? {} : { tls: settings.natsTls }),
  });
  if (!transport.ok) return transport;
  return ok(runningWorker(root, transport.value));
}

function runningWorker(root: WorkerRoot, transport: TransportConnection): RunningWorker {
  let finish: () => void = () => undefined;
  const stopped = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let stopping: Promise<void> | undefined;
  const stop = () => {
    stopping ??= closeAll(root, transport).finally(finish);
    return stopping;
  };
  return Object.freeze({ identity: root.identity, root, transport, stopped, stop });
}

async function closeAll(root: WorkerRoot, transport: TransportConnection): Promise<void> {
  try {
    await transport.close();
  } finally {
    root.close();
  }
}

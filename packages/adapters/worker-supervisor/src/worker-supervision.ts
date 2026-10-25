import { err, failure, ok, type Result } from '@taskelith/kernel';
import { sameProcess } from './process-identity.js';
import type { ExecutionLock, Platform, RecordStore } from './ports.js';
import {
  encodeRecord,
  parseExit,
  parseHandle,
  parseIntent,
  parseLaunch,
  parseSupervisor,
  RECORD_FILES,
  supervisorFile,
  type ExitRecord,
  type HandleRecord,
  type IntentRecord,
  type LaunchRecord,
  type RecordProblem,
} from './record.js';
import {
  decideRecovery,
  type NativeEvidence,
  type RecordSnapshot,
  type RecoveryDecision,
  type RecoveryEvidence,
  type SupervisorLiveness,
} from './recovery.js';
import { highestSupervisor } from './supervisor.js';

export type SupervisorMode = 'launch' | 'adopt';

export interface WorkerSupervisionDependencies {
  readonly store: RecordStore;
  readonly lock: ExecutionLock;
  readonly platform: Platform;
  // Starts a supervisor as a detached process in a new session (CP4).
  readonly startSupervisor: (mode: SupervisorMode) => Result<void>;
  readonly crashPoint: (point: string) => void;
}

// CP2: the worker creates the directory and writes `intent`, which it may
// replace only while no launch record exists.
export async function prepareRecord(dependencies: WorkerSupervisionDependencies, intent: IntentRecord): Promise<Result<void>> {
  const directory = await dependencies.store.createDirectory();
  if (!directory.ok) return directory;
  const launch = await dependencies.store.read(RECORD_FILES.launch);
  if (!launch.ok) return launch;
  if (launch.value !== undefined) return err(failure('conflict', 'the launch record exists, so intent is final'));
  const written = await dependencies.store.replace(RECORD_FILES.intent, encodeRecord(intent));
  if (written.ok) dependencies.crashPoint('CP2');
  return written;
}

export function startSupervisor(dependencies: WorkerSupervisionDependencies): Result<void> {
  const started = dependencies.startSupervisor('launch');
  if (started.ok) dependencies.crashPoint('CP4');
  return started;
}

// A seal that loses its race returns the winning record (contract section 5).
export async function sealLaunch(dependencies: WorkerSupervisionDependencies): Promise<Result<LaunchRecord>> {
  const created = await dependencies.store.createOnce(RECORD_FILES.launch, encodeRecord({ kind: 'seal', by: 'worker', reason: 'recovery' }));
  if (!created.ok) return created;
  const text = await dependencies.store.read(RECORD_FILES.launch);
  if (!text.ok) return text;
  const launch = text.value === undefined ? undefined : parseLaunch(text.value);
  return launch?.ok ? ok(launch.value) : err(failure('internal', 'the launch record cannot be read back'));
}

export async function requestCancellation(dependencies: WorkerSupervisionDependencies, reason: string): Promise<Result<void>> {
  const created = await dependencies.store.createOnce(RECORD_FILES.cancel, encodeRecord({ reason }));
  return created.ok ? ok(undefined) : created;
}

export interface ReportedFacts {
  readonly handle?: HandleRecord;
  readonly exit?: ExitRecord;
  readonly problems: readonly RecordProblem[];
}

// CP10 and CP12: what the supervisor wrote, for the worker's outbox.
export async function readReportedFacts(dependencies: WorkerSupervisionDependencies): Promise<Result<ReportedFacts>> {
  const snapshot = await readSnapshot(dependencies.store);
  if (!snapshot.ok) return snapshot;
  const { handle, exit, problems } = snapshot.value;
  return ok({ ...(handle ? { handle } : {}), ...(exit ? { exit } : {}), problems });
}

export type RecoveryResult =
  | { readonly fact: 'not-started' }
  | { readonly fact: 'exited'; readonly exit: ExitRecord }
  | { readonly fact: 'adopted' }
  | { readonly fact: 'retry' }
  | { readonly fact: 'uncertain'; readonly reason: string };

// Recovery when the worker service starts (contract section 6). `journaled`
// is what the worker journal recorded: the intent only, or the record.
export async function recoverExecution(
  dependencies: WorkerSupervisionDependencies,
  journaled: 'intent' | 'record',
  livenessRetriesExhausted = false,
): Promise<Result<RecoveryResult>> {
  const evidence = await gatherEvidence(dependencies, journaled, livenessRetriesExhausted);
  if (!evidence.ok) return evidence;
  return applyDecision(dependencies, decideRecovery(evidence.value), journaled);
}

async function applyDecision(
  dependencies: WorkerSupervisionDependencies,
  decision: RecoveryDecision,
  journaled: 'intent' | 'record',
): Promise<Result<RecoveryResult>> {
  switch (decision.action) {
    case 'complete-and-seal':
    case 'seal':
      return sealAndDecide(dependencies, decision.action, journaled);
    case 'report-not-started':
      return ok({ fact: 'not-started' });
    case 'report-exit':
      return ok({ fact: 'exited', exit: decision.exit });
    case 'complete-spawn-failure':
      return writeExit(dependencies, { status: { kind: 'unknown' }, startProven: false, spawnFailure: decision.failure, termination: 'never-spawned' });
    case 'write-unknown-exit':
      return writeExit(dependencies, { status: { kind: 'unknown' }, startProven: decision.startProven, termination: decision.termination });
    case 'adopt-supervisor':
      return ok({ fact: 'adopted' });
    case 'adopt-containment':
    case 'adopt-child': {
      const started = dependencies.startSupervisor('adopt');
      return started.ok ? ok({ fact: 'adopted' }) : started;
    }
    case 'retry-liveness':
      return ok({ fact: 'retry' });
    case 'uncertain':
      return ok({ fact: 'uncertain', reason: decision.reason });
  }
}

// The seal is reported as `not-started` only once read back; a lost race is
// decided again from the winning record.
async function sealAndDecide(
  dependencies: WorkerSupervisionDependencies,
  action: 'complete-and-seal' | 'seal',
  journaled: 'intent' | 'record',
): Promise<Result<RecoveryResult>> {
  if (action === 'complete-and-seal') {
    const directory = await dependencies.store.createDirectory();
    if (!directory.ok) return directory;
  }
  const winner = await sealLaunch(dependencies);
  if (!winner.ok) return winner;
  if (winner.value.kind === 'seal') return ok({ fact: 'not-started' });
  return recoverExecution(dependencies, journaled === 'intent' ? 'record' : journaled);
}

async function writeExit(dependencies: WorkerSupervisionDependencies, exit: ExitRecord): Promise<Result<RecoveryResult>> {
  const created = await dependencies.store.createOnce(RECORD_FILES.exit, encodeRecord(exit));
  if (!created.ok) return created;
  const facts = await readReportedFacts(dependencies);
  if (!facts.ok) return facts;
  return facts.value.exit ? ok({ fact: 'exited', exit: facts.value.exit }) : err(failure('internal', 'the exit cannot be read back'));
}

export async function gatherEvidence(
  dependencies: WorkerSupervisionDependencies,
  journaled: 'intent' | 'record',
  livenessRetriesExhausted: boolean,
): Promise<Result<RecoveryEvidence>> {
  const exists = await dependencies.store.exists();
  if (!exists.ok) return exists;
  const snapshot = exists.value ? await readSnapshot(dependencies.store) : ok<'missing'>('missing');
  if (!snapshot.ok) return snapshot;
  const record = snapshot.value === 'missing' || snapshot.value.intent === undefined ? 'missing' : snapshot.value;
  const supervisor = record === 'missing' ? 'none' : await supervisorLiveness(dependencies, livenessRetriesExhausted);
  const native = nativeEvidence(dependencies.platform, record === 'missing' ? undefined : record);
  if (!native.ok) return native;
  return ok({ journaled, record, supervisor, native: native.value });
}

async function readSnapshot(store: RecordStore): Promise<Result<RecordSnapshot>> {
  const problems: RecordProblem[] = [];
  const read = async <T>(name: string, parse: (text: string) => Result<T, RecordProblem>): Promise<Result<T | undefined>> => {
    const text = await store.read(name);
    if (!text.ok) return text;
    if (text.value === undefined) return ok(undefined);
    const parsed = parse(text.value);
    if (parsed.ok) return ok(parsed.value);
    problems.push(parsed.error);
    return ok(undefined);
  };
  const intent = await read(RECORD_FILES.intent, parseIntent);
  const launch = await read(RECORD_FILES.launch, parseLaunch);
  const handle = await read(RECORD_FILES.handle, parseHandle);
  const exit = await read(RECORD_FILES.exit, parseExit);
  for (const result of [intent, launch, handle, exit]) if (!result.ok) return result;
  return ok({
    problems,
    ...(intent.ok && intent.value ? { intent: intent.value } : {}),
    ...(launch.ok && launch.value ? { launch: launch.value } : {}),
    ...(handle.ok && handle.value ? { handle: handle.value } : {}),
    ...(exit.ok && exit.value ? { exit: exit.value } : {}),
  });
}

// Live only if the lock is held and the highest supervisor record names a
// live process (contract section 6).
async function supervisorLiveness(dependencies: WorkerSupervisionDependencies, retriesExhausted: boolean): Promise<SupervisorLiveness> {
  const probe = dependencies.lock.tryAcquire();
  if (probe.ok && probe.value !== undefined) {
    probe.value.release();
    return 'none';
  }
  const names = await dependencies.store.list();
  const serial = names.ok ? highestSupervisor(names.value) : 0;
  const text = serial === 0 ? undefined : await dependencies.store.read(supervisorFile(serial));
  const record = text?.ok && text.value !== undefined ? parseSupervisor(supervisorFile(serial), text.value) : undefined;
  if (record?.ok && isAlive(dependencies.platform, record.value.process)) return 'live';
  return retriesExhausted ? 'lock-held-by-dead-after-retries' : 'lock-held-by-dead';
}

function isAlive(platform: Platform, process: Parameters<typeof sameProcess>[0]): boolean {
  const current = platform.inspector.identity(process.pid);
  return current.ok && current.value !== undefined && sameProcess(current.value, process);
}

function nativeEvidence(platform: Platform, record: RecordSnapshot | undefined): Result<NativeEvidence> {
  const boot = platform.inspector.bootId();
  if (!boot.ok) return boot;
  const bootChanged = record?.intent !== undefined && record.intent.deadline.bootId !== boot.value;
  if (platform.name === 'darwin') {
    const child = record?.handle?.kind === 'spawned' ? record.handle.process : undefined;
    return ok({ platform: 'darwin', bootChanged, childAlive: child !== undefined && isAlive(platform, child) });
  }
  const incarnation = platform.namespaceIncarnation();
  const namespaceCurrent = record?.intent?.namespaceIncarnation === undefined
    || (incarnation?.ok === true && incarnation.value === record.intent.namespaceIncarnation);
  const containment = record?.intent === undefined ? undefined : platform.containment(record.intent.executionId);
  const populated = containment?.ok ? containment.value.populated() : undefined;
  return ok({
    platform: 'linux',
    bootChanged,
    namespaceCurrent,
    // No mechanism proves an old namespace's end yet (decision D-C2 (a)).
    oldNamespaceEndProven: false,
    containment: populated === undefined || !populated.ok ? 'unreadable' : populated.value ? 'populated' : 'empty',
  });
}

// Only after the terminal fact is recorded, and only while the worker holds
// `lock` itself; the launch record goes last (contract section 3).
export async function removeRecord(dependencies: WorkerSupervisionDependencies): Promise<Result<void>> {
  const held = dependencies.lock.tryAcquire();
  if (!held.ok) return held;
  if (held.value === undefined) return err(failure('conflict', 'a supervisor holds the lock'));
  try {
    const names = await dependencies.store.list();
    if (!names.ok) return names;
    const others = names.value.filter((name) => name !== RECORD_FILES.launch);
    const ordered = names.value.includes(RECORD_FILES.launch) ? [...others, RECORD_FILES.launch] : others;
    for (const name of ordered) {
      const removed = await dependencies.store.remove(name);
      if (!removed.ok) return removed;
    }
    return await dependencies.store.removeDirectory();
  } finally {
    held.value.release();
  }
}

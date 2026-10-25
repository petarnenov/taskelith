import type { ExitStatus } from '@taskelith/execution';
import { err, ok, type Result } from '@taskelith/kernel';
import { encodeEvent, parseEvents } from './event-log.js';
import { sameProcess, type ProcessIdentity } from './process-identity.js';
import type { ChildExit, Containment, ExecutionLock, HeldLock, Platform, RecordStore, Spawner } from './ports.js';
import {
  encodeRecord,
  parseHandle,
  parseIntent,
  parseLaunch,
  RECORD_FILES,
  supervisorFile,
  type EventEntry,
  type ExitRecord,
  type HandleRecord,
  type IntentRecord,
  type LaunchRecord,
  type RecordProblem,
  type SealReason,
} from './record.js';
import { proveDarwinTermination } from './termination.js';

export interface SupervisorTiming {
  readonly pollMilliseconds: number;
  readonly graceMilliseconds: number;
  readonly retryMilliseconds: number;
  // Polls of an unreadable containment before the supervisor gives up.
  readonly unreadablePolls: number;
}

export interface SupervisorDependencies {
  readonly store: RecordStore;
  readonly lock: ExecutionLock;
  readonly platform: Platform;
  readonly spawner: Spawner;
  readonly selfPid: number;
  readonly timing: SupervisorTiming;
  readonly sleep: (milliseconds: number) => Promise<void>;
  // Names each step of contract section 4 for the test harness.
  readonly crashPoint: (point: string) => void;
}

export type SupervisorOutcome =
  | { readonly kind: 'lock-busy' }
  | { readonly kind: 'record-unusable'; readonly reason: string }
  | { readonly kind: 'not-first' }
  | { readonly kind: 'sealed'; readonly reason: SealReason }
  | { readonly kind: 'launch-exists'; readonly launch: LaunchRecord | undefined }
  | { readonly kind: 'write-failed'; readonly file: string }
  | { readonly kind: 'containment-unreadable' }
  | { readonly kind: 'exited'; readonly exit: ExitRecord }
  | { readonly kind: 'child-gone' };

// The first supervisor of an execution: steps CP5 to CP11 of the contract.
export async function superviseLaunch(dependencies: SupervisorDependencies): Promise<SupervisorOutcome> {
  return withLock(dependencies, async (session) => {
    // Without its own identity no supervisor record proves who claims.
    if (session.serial === 'identity-unreadable') return seal(dependencies, 'identity-unreadable');
    if (session.serial === 'write-failed') return { kind: 'write-failed', file: 'supervisor record' };
    if (session.serial !== 1) return { kind: 'not-first' };
    const refusal = checkLaunchable(dependencies, session.intent);
    if (refusal !== undefined) return seal(dependencies, refusal);
    dependencies.crashPoint('CP5');
    const containment = prepareContainment(dependencies, session.intent);
    if (containment === 'unavailable') return seal(dependencies, 'containment-unavailable');
    dependencies.crashPoint('CP6');
    const claim = await claimLaunch(dependencies, session.intent, containment);
    if (claim !== undefined) {
      containment?.remove();
      return claim;
    }
    dependencies.crashPoint('CP7');
    return runChild(dependencies, session.intent, containment);
  });
}

// An adopting supervisor continues observation and cancellation; it is not
// the child's parent, so it never learns the child's exit status.
export async function adoptExecution(dependencies: SupervisorDependencies): Promise<SupervisorOutcome> {
  return withLock(dependencies, async (session) => {
    if (typeof session.serial !== 'number') return { kind: 'record-unusable', reason: 'the supervisor record cannot be written' };
    const launch = await readParsed(dependencies.store, RECORD_FILES.launch, parseLaunch);
    const handle = await readParsed(dependencies.store, RECORD_FILES.handle, parseHandle);
    if (!launch.ok || !handle.ok || launch.value?.kind !== 'claim') return { kind: 'record-unusable', reason: 'no readable claim' };
    const startProven = handle.value?.kind === 'spawned';
    if (dependencies.platform.name === 'linux') return adoptContainment(dependencies, launch.value, startProven);
    return handle.value?.kind === 'spawned' ? observeAdoptedChild(dependencies, handle.value) : { kind: 'record-unusable', reason: 'no handle' };
  });
}

interface Session {
  readonly serial: number | 'identity-unreadable' | 'write-failed';
  readonly intent: IntentRecord;
}

async function withLock(
  dependencies: SupervisorDependencies,
  body: (session: Session) => Promise<SupervisorOutcome>,
): Promise<SupervisorOutcome> {
  const acquired = dependencies.lock.tryAcquire();
  if (!acquired.ok || acquired.value === undefined) return { kind: 'lock-busy' };
  const held: HeldLock = acquired.value;
  try {
    const intent = await readParsed(dependencies.store, RECORD_FILES.intent, parseIntent);
    if (!intent.ok || intent.value === undefined) return { kind: 'record-unusable', reason: 'intent is missing or unreadable' };
    return await body({ serial: await writeSupervisorRecord(dependencies), intent: intent.value });
  } finally {
    held.release();
  }
}

async function writeSupervisorRecord(dependencies: SupervisorDependencies): Promise<Session['serial']> {
  const self = dependencies.platform.inspector.identity(dependencies.selfPid);
  if (!self.ok || self.value === undefined) return 'identity-unreadable';
  const names = await dependencies.store.list();
  if (!names.ok) return 'write-failed';
  let serial = highestSupervisor(names.value) + 1;
  for (;;) {
    const created = await dependencies.store.createOnce(supervisorFile(serial), encodeRecord({ serial, process: self.value }));
    if (!created.ok) return 'write-failed';
    if (created.value === 'created') return serial;
    serial += 1;
  }
}

export function highestSupervisor(names: readonly string[]): number {
  return names.reduce((highest, name) => {
    const match = /^supervisor\.([1-9]\d*)$/.exec(name);
    return match === null ? highest : Math.max(highest, Number(match[1]));
  }, 0);
}

// The checks of CP5: the boot of the intent, a readable deadline clock, and
// a deadline that has not passed.
function checkLaunchable(dependencies: SupervisorDependencies, intent: IntentRecord): SealReason | undefined {
  const boot = dependencies.platform.inspector.bootId();
  if (!boot.ok || boot.value !== intent.deadline.bootId) return 'boot-changed';
  return deadlineRefusal(dependencies, intent);
}

function deadlineRefusal(dependencies: SupervisorDependencies, intent: IntentRecord): SealReason | undefined {
  const reading = dependencies.platform.clock.read();
  if (!reading.ok) return 'deadline-unreadable';
  if (reading.value.bootId !== intent.deadline.bootId) return 'boot-changed';
  return reading.value.milliseconds < intent.deadline.milliseconds ? undefined : 'deadline-passed';
}

async function seal(dependencies: SupervisorDependencies, reason: SealReason): Promise<SupervisorOutcome> {
  const created = await dependencies.store.createOnce(RECORD_FILES.launch, encodeRecord({ kind: 'seal', by: 'supervisor', reason }));
  if (!created.ok) return { kind: 'write-failed', file: RECORD_FILES.launch };
  if (created.value === 'created') return { kind: 'sealed', reason };
  return { kind: 'launch-exists', launch: await readLaunch(dependencies.store) };
}

function prepareContainment(dependencies: SupervisorDependencies, intent: IntentRecord): Containment | undefined | 'unavailable' {
  const containment = dependencies.platform.containment(intent.executionId);
  if (containment === undefined) return undefined;
  if (!containment.ok) return 'unavailable';
  return containment.value.create().ok ? containment.value : 'unavailable';
}

async function claimLaunch(
  dependencies: SupervisorDependencies,
  intent: IntentRecord,
  containment: Containment | undefined,
): Promise<SupervisorOutcome | undefined> {
  const claim = { kind: 'claim', launchAuthId: intent.launchAuthId, supervisor: 1, ...(containment ? { containment: containment.path } : {}) };
  const created = await dependencies.store.createOnce(RECORD_FILES.launch, encodeRecord(claim));
  if (!created.ok) return { kind: 'write-failed', file: RECORD_FILES.launch };
  if (created.value === 'created') return undefined;
  return { kind: 'launch-exists', launch: await readLaunch(dependencies.store) };
}

// CP8 to CP11. After the spawn, a failed durable write is retried while the
// child keeps running (contract section 4).
async function runChild(
  dependencies: SupervisorDependencies,
  intent: IntentRecord,
  containment: Containment | undefined,
): Promise<SupervisorOutcome> {
  if (deadlineRefusal(dependencies, intent) !== undefined) {
    return finishSpawnFailure(dependencies, 'the deadline passed before the spawn', containment);
  }
  const admitted = containment?.admit(dependencies.selfPid);
  if (admitted !== undefined && !admitted.ok) {
    return finishSpawnFailure(dependencies, `cannot enter the containment: ${admitted.error.message}`, containment);
  }
  const spawned = await dependencies.spawner.spawn(intent.command, intent.executionAccount);
  if (containment !== undefined) await persist(dependencies, async () => containment.release(dependencies.selfPid));
  dependencies.crashPoint('CP8');
  if (spawned.kind === 'failed') return finishSpawnFailure(dependencies, spawned.failure, containment);
  const handle = await recordHandle(dependencies, spawned.pid);
  dependencies.crashPoint('CP9');
  const status = await watchChild(dependencies, spawned.exited, handle, containment);
  const termination = await proveTermination(dependencies, handle, containment);
  if (termination === undefined) return { kind: 'containment-unreadable' };
  const exit: ExitRecord = { status, startProven: true, termination };
  await persist(dependencies, () => dependencies.store.createOnce(RECORD_FILES.exit, encodeRecord(exit)));
  dependencies.crashPoint('CP11');
  containment?.remove();
  return { kind: 'exited', exit };
}

async function finishSpawnFailure(
  dependencies: SupervisorDependencies,
  failure: string,
  containment: Containment | undefined,
): Promise<SupervisorOutcome> {
  await persist(dependencies, () => dependencies.store.createOnce(RECORD_FILES.handle, encodeRecord({ kind: 'spawn-failed', failure })));
  dependencies.crashPoint('CP9');
  const exit: ExitRecord = { status: { kind: 'unknown' }, startProven: false, spawnFailure: failure, termination: 'never-spawned' };
  await persist(dependencies, () => dependencies.store.createOnce(RECORD_FILES.exit, encodeRecord(exit)));
  dependencies.crashPoint('CP11');
  containment?.remove();
  return { kind: 'exited', exit };
}

// Without a readable identity no handle is written; recovery then decides as
// for a crash between CP8 and CP9.
async function recordHandle(dependencies: SupervisorDependencies, pid: number): Promise<HandleRecord | undefined> {
  const identity = dependencies.platform.inspector.identity(pid);
  if (!identity.ok || identity.value === undefined) return undefined;
  const handle: HandleRecord = { kind: 'spawned', process: identity.value, processGroupId: pid };
  await persist(dependencies, () => dependencies.store.createOnce(RECORD_FILES.handle, encodeRecord(handle)));
  return handle;
}

async function watchChild(
  dependencies: SupervisorDependencies,
  exited: Promise<ChildExit>,
  handle: HandleRecord | undefined,
  containment: Containment | undefined,
): Promise<ExitStatus> {
  let result: ChildExit | undefined;
  void exited.then((value) => {
    result = value;
  });
  const seen: ProcessIdentity[] = [];
  let cancelled = false;
  while (result === undefined) {
    if (handle?.kind === 'spawned' && containment === undefined) await recordDescendants(dependencies, handle, seen);
    if (!cancelled && (await cancellationRequested(dependencies.store))) {
      cancelled = await cancel(dependencies, handle, containment, () => result !== undefined);
    }
    await Promise.race([exited, dependencies.sleep(dependencies.timing.pollMilliseconds)]);
  }
  return exitStatus(result);
}

// Linux kills the whole containment; on macOS the group is signalled only
// while its leader, the child, has not been reaped (contract section 8).
async function cancel(
  dependencies: SupervisorDependencies,
  handle: HandleRecord | undefined,
  containment: Containment | undefined,
  reaped: () => boolean,
): Promise<boolean> {
  if (containment !== undefined) return killContainment(dependencies, containment);
  if (handle?.kind !== 'spawned' || reaped()) return true;
  dependencies.spawner.signalGroup(handle.processGroupId, 'SIGTERM');
  await appendEvent(dependencies, { kind: 'cancellation', step: 'terminate-sent' });
  await dependencies.sleep(dependencies.timing.graceMilliseconds);
  if (reaped()) return true;
  dependencies.spawner.signalGroup(handle.processGroupId, 'SIGKILL');
  await appendEvent(dependencies, { kind: 'cancellation', step: 'kill-sent' });
  return true;
}

// A kill that failed is not evidence; the caller tries again next poll.
async function killContainment(dependencies: SupervisorDependencies, containment: Containment): Promise<boolean> {
  if (!containment.kill().ok) return false;
  await appendEvent(dependencies, { kind: 'cancellation', step: 'containment-killed' });
  return true;
}

// Waits until the containment empties, killing it on a cancellation. One
// that stays unreadable ends the wait without proof, so recovery decides.
async function awaitEmptyContainment(dependencies: SupervisorDependencies, containment: Containment): Promise<'empty' | 'unreadable'> {
  let cancelled = false;
  for (let unreadable = 0; ; await dependencies.sleep(dependencies.timing.pollMilliseconds)) {
    const populated = containment.populated();
    if (populated.ok && !populated.value) return 'empty';
    unreadable = populated.ok ? 0 : unreadable + 1;
    if (unreadable >= dependencies.timing.unreadablePolls) return 'unreadable';
    if (!cancelled && (await cancellationRequested(dependencies.store))) cancelled = await killContainment(dependencies, containment);
  }
}

async function proveTermination(
  dependencies: SupervisorDependencies,
  handle: HandleRecord | undefined,
  containment: Containment | undefined,
): Promise<ExitRecord['termination'] | undefined> {
  if (containment !== undefined) {
    return (await awaitEmptyContainment(dependencies, containment)) === 'empty' ? 'containment-empty' : undefined;
  }
  for (let reported = false; ; await dependencies.sleep(dependencies.timing.pollMilliseconds)) {
    const proof = await darwinProof(dependencies, handle);
    if (proof.proven) return 'process-group-empty';
    if (!reported) await appendEvent(dependencies, { kind: 'survivors', processes: proof.survivors });
    reported = true;
  }
}

async function darwinProof(dependencies: SupervisorDependencies, handle: HandleRecord | undefined) {
  if (handle?.kind !== 'spawned') return { proven: false as const, survivors: [] };
  const listing = dependencies.platform.inspector.listing();
  return proveDarwinTermination({
    processGroupId: handle.processGroupId,
    listing: listing.ok ? listing.value : undefined,
    recordedDescendants: await recordedDescendants(dependencies.store),
  });
}

// The interval walk of parent links that records every descendant seen.
async function recordDescendants(dependencies: SupervisorDependencies, handle: Extract<HandleRecord, { kind: 'spawned' }>, seen: ProcessIdentity[]) {
  const listing = dependencies.platform.inspector.listing();
  if (!listing.ok) return;
  const family = new Set([handle.process.pid]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const entry of listing.value) {
      if (family.has(entry.parentPid) && !family.has(entry.identity.pid)) {
        family.add(entry.identity.pid);
        grew = true;
        if (seen.some((known) => sameProcess(known, entry.identity))) continue;
        seen.push(entry.identity);
        await appendEvent(dependencies, { kind: 'descendant', process: entry.identity });
      }
    }
  }
}

async function adoptContainment(
  dependencies: SupervisorDependencies,
  launch: Extract<LaunchRecord, { kind: 'claim' }>,
  startProven: boolean,
): Promise<SupervisorOutcome> {
  const intent = await readParsed(dependencies.store, RECORD_FILES.intent, parseIntent);
  const containment = intent.ok && intent.value ? dependencies.platform.containment(intent.value.executionId) : undefined;
  if (containment === undefined || !containment.ok || containment.value.path !== launch.containment) {
    return { kind: 'record-unusable', reason: 'the claimed containment is not available' };
  }
  if ((await awaitEmptyContainment(dependencies, containment.value)) === 'unreadable') return { kind: 'containment-unreadable' };
  const exit: ExitRecord = { status: { kind: 'unknown' }, startProven, termination: 'containment-empty' };
  await persist(dependencies, () => dependencies.store.createOnce(RECORD_FILES.exit, encodeRecord(exit)));
  containment.value.remove();
  return { kind: 'exited', exit };
}

// macOS adoption observes only: an adopter cannot signal safely, and a
// cancellation it receives is recorded as not applied (section 8).
async function observeAdoptedChild(
  dependencies: SupervisorDependencies,
  handle: Extract<HandleRecord, { kind: 'spawned' }>,
): Promise<SupervisorOutcome> {
  const seen = await recordedDescendants(dependencies.store);
  for (let noted = false; ; await dependencies.sleep(dependencies.timing.pollMilliseconds)) {
    const identity = dependencies.platform.inspector.identity(handle.process.pid);
    if (!identity.ok || identity.value === undefined || !sameProcess(identity.value, handle.process)) return { kind: 'child-gone' };
    await recordDescendants(dependencies, handle, seen);
    if (!noted && (await cancellationRequested(dependencies.store))) {
      noted = true;
      await appendEvent(dependencies, { kind: 'cancellation', step: 'not-applied' });
    }
  }
}

async function recordedDescendants(store: RecordStore): Promise<ProcessIdentity[]> {
  const text = await store.read(RECORD_FILES.events);
  if (!text.ok || text.value === undefined) return [];
  const events = parseEvents(text.value);
  if (!events.ok) return [];
  return events.value.flatMap((entry) => (entry.kind === 'descendant' ? [entry.process] : []));
}

async function cancellationRequested(store: RecordStore): Promise<boolean> {
  const text = await store.read(RECORD_FILES.cancel);
  return text.ok && text.value !== undefined;
}

async function appendEvent(dependencies: SupervisorDependencies, entry: EventEntry): Promise<void> {
  await persist(dependencies, () => dependencies.store.append(RECORD_FILES.events, encodeEvent(entry)));
}

async function persist<T>(dependencies: SupervisorDependencies, write: () => Promise<Result<T>>): Promise<void> {
  while (!(await write()).ok) await dependencies.sleep(dependencies.timing.retryMilliseconds);
}

async function readLaunch(store: RecordStore): Promise<LaunchRecord | undefined> {
  const launch = await readParsed(store, RECORD_FILES.launch, parseLaunch);
  return launch.ok ? launch.value : undefined;
}

async function readParsed<T>(
  store: RecordStore,
  name: string,
  parse: (text: string) => Result<T, RecordProblem>,
): Promise<Result<T | undefined, RecordProblem | 'unreadable'>> {
  const text = await store.read(name);
  if (!text.ok) return err('unreadable');
  return text.value === undefined ? ok(undefined) : parse(text.value);
}

function exitStatus(exit: ChildExit): ExitStatus {
  if (exit.signal !== null) return { kind: 'signal', signal: exit.signal };
  return exit.code === null ? { kind: 'unknown' } : { kind: 'code', code: exit.code };
}

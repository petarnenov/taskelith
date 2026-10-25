import type { ExitStatus } from '@taskelith/execution';
import { awaitDarwinTermination, awaitEmptyContainment, cancelGroup, killContainment, recordDescendants, type Child } from './process-set.js';
import type { ProcessIdentity } from './process-identity.js';
import type { ChildExit, Containment } from './ports.js';
import { encodeRecord, RECORD_FILES, type ExitRecord, type HandleRecord, type IntentRecord, type SealReason } from './record.js';
import {
  attempt,
  cancellationRequested,
  persist,
  readLaunch,
  withLock,
  writeExit,
  type SupervisorDependencies,
  type SupervisorOutcome,
} from './supervisor-session.js';

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

// CP8 to CP11. On Linux the child is born in the containment, and the
// supervisor leaves it before it watches or proves anything.
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
  // Read before any wait, while the child cannot yet have been reaped.
  const identity = spawned.kind === 'spawned' ? dependencies.platform.inspector.identity(spawned.pid) : undefined;
  if (containment !== undefined && !(await attempt(dependencies, () => containment.release(dependencies.selfPid)))) {
    return { kind: 'containment-unusable' };
  }
  dependencies.crashPoint('CP8');
  if (spawned.kind === 'failed') return finishSpawnFailure(dependencies, spawned.failure, containment);
  const child: Child = { pid: spawned.pid };
  await recordHandle(dependencies, child, identity?.ok ? identity.value : undefined);
  dependencies.crashPoint('CP9');
  const status = await watchChild(dependencies, spawned.exited, child, containment);
  const termination = containment === undefined
    ? await awaitDarwinTermination(dependencies, child)
    : await awaitEmptyContainment(dependencies, containment);
  if (termination === 'unreadable') return { kind: 'containment-unreadable' };
  if (termination === 'unprovable') return { kind: 'termination-unprovable' };
  const exit: ExitRecord = { status, startProven: true, termination: containment === undefined ? 'process-group-empty' : 'containment-empty' };
  await writeExit(dependencies, exit);
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
  await writeExit(dependencies, exit);
  dependencies.crashPoint('CP11');
  containment?.remove();
  return { kind: 'exited', exit };
}

// Without a readable identity no handle is written. The supervisor still
// holds the child, and recovery decides as for a crash between CP8 and CP9.
async function recordHandle(dependencies: SupervisorDependencies, child: Child, identity: ProcessIdentity | undefined): Promise<void> {
  if (identity === undefined) return;
  const handle: HandleRecord = { kind: 'spawned', process: identity, processGroupId: child.pid };
  await persist(dependencies, () => dependencies.store.createOnce(RECORD_FILES.handle, encodeRecord(handle)));
}

async function watchChild(
  dependencies: SupervisorDependencies,
  exited: Promise<ChildExit>,
  child: Child,
  containment: Containment | undefined,
): Promise<ExitStatus> {
  let result: ChildExit | undefined;
  void exited.then((value) => {
    result = value;
  });
  const seen: ProcessIdentity[] = [];
  let cancelled = false;
  while (result === undefined) {
    if (containment === undefined) await recordDescendants(dependencies, child, seen);
    if (!cancelled && (await cancellationRequested(dependencies.store))) {
      if (containment !== undefined) cancelled = await killContainment(dependencies, containment);
      else {
        await cancelGroup(dependencies, child, () => result !== undefined);
        cancelled = true;
      }
    }
    await Promise.race([exited, dependencies.sleep(dependencies.timing.pollMilliseconds)]);
  }
  return exitStatus(result);
}

function exitStatus(exit: ChildExit): ExitStatus {
  if (exit.signal !== null) return { kind: 'signal', signal: exit.signal };
  return exit.code === null ? { kind: 'unknown' } : { kind: 'code', code: exit.code };
}

import { appendEvent, awaitEmptyContainment, recordDescendants, recordedDescendants } from './process-set.js';
import { sameProcess } from './process-identity.js';
import { parseHandle, parseLaunch, RECORD_FILES, type ExitRecord, type HandleRecord, type IntentRecord, type LaunchRecord } from './record.js';
import { cancellationRequested, readParsed, withLock, writeExit, type SupervisorDependencies, type SupervisorOutcome } from './supervisor-session.js';

// An adopting supervisor continues observation and cancellation; it is not
// the child's parent, so it never learns the child's exit status.
export async function adoptExecution(dependencies: SupervisorDependencies): Promise<SupervisorOutcome> {
  return withLock(dependencies, async (session) => {
    if (typeof session.serial !== 'number') return { kind: 'record-unusable', reason: 'the supervisor record cannot be written' };
    const launch = await readParsed(dependencies.store, RECORD_FILES.launch, parseLaunch);
    const handle = await readParsed(dependencies.store, RECORD_FILES.handle, parseHandle);
    if (!launch.ok || !handle.ok || launch.value?.kind !== 'claim') return { kind: 'record-unusable', reason: 'no readable claim' };
    const startProven = handle.value?.kind === 'spawned';
    if (dependencies.platform.name === 'linux') return adoptContainment(dependencies, session.intent, launch.value, startProven);
    return handle.value?.kind === 'spawned' ? observeAdoptedChild(dependencies, handle.value) : { kind: 'record-unusable', reason: 'no handle' };
  });
}

async function adoptContainment(
  dependencies: SupervisorDependencies,
  intent: IntentRecord,
  launch: Extract<LaunchRecord, { kind: 'claim' }>,
  startProven: boolean,
): Promise<SupervisorOutcome> {
  const containment = dependencies.platform.containment(intent.executionId);
  if (containment === undefined || !containment.ok || containment.value.path !== launch.containment) {
    return { kind: 'record-unusable', reason: 'the claimed containment is not available' };
  }
  if ((await awaitEmptyContainment(dependencies, containment.value)) === 'unreadable') return { kind: 'containment-unreadable' };
  const exit: ExitRecord = { status: { kind: 'unknown' }, startProven, termination: 'containment-empty' };
  await writeExit(dependencies, exit);
  containment.value.remove();
  return { kind: 'exited', exit };
}

// macOS adoption observes only: an adopter cannot signal safely, and a
// cancellation it receives is recorded as not applied (section 8).
async function observeAdoptedChild(
  dependencies: SupervisorDependencies,
  handle: Extract<HandleRecord, { kind: 'spawned' }>,
): Promise<SupervisorOutcome> {
  const recorded = await recordedDescendants(dependencies.store);
  if (!recorded.ok) return { kind: 'record-unusable', reason: recorded.error.message };
  const seen = recorded.value;
  for (let noted = false; ; await dependencies.sleep(dependencies.timing.pollMilliseconds)) {
    const identity = dependencies.platform.inspector.identity(handle.process.pid);
    if (!identity.ok || identity.value === undefined || !sameProcess(identity.value, handle.process)) return { kind: 'child-gone' };
    await recordDescendants(dependencies, { pid: handle.process.pid }, seen);
    if (!noted && (await cancellationRequested(dependencies.store))) {
      noted = true;
      await appendEvent(dependencies, { kind: 'cancellation', step: 'not-applied' });
    }
  }
}

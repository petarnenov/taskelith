import { err, failure, ok, type Result } from '@taskelith/kernel';
import { encodeEvent, parseEvents } from './event-log.js';
import { sameProcess, type ProcessIdentity } from './process-identity.js';
import type { Containment, RecordStore } from './ports.js';
import { RECORD_FILES, type EventEntry } from './record.js';
import { cancellationRequested, persist, type SupervisorDependencies } from './supervisor-session.js';
import { proveDarwinTermination } from './termination.js';

// The child leads its own process group, so its process ID is the group ID.
export interface Child {
  readonly pid: number;
}

// A torn last entry is cut off before the next one is written, so that it
// can never join the new entry into a damaged one.
export async function appendEvent(dependencies: SupervisorDependencies, entry: EventEntry): Promise<void> {
  const frame = encodeEvent(entry);
  await persist(dependencies, async () => {
    const text = await dependencies.store.read(RECORD_FILES.events);
    if (!text.ok) return text;
    const current = text.value ?? '';
    if (current === '' || current.endsWith('\n')) return dependencies.store.append(RECORD_FILES.events, frame);
    return dependencies.store.replace(RECORD_FILES.events, current.slice(0, current.lastIndexOf('\n') + 1) + frame);
  });
}

export async function recordedDescendants(store: RecordStore): Promise<Result<ProcessIdentity[]>> {
  const text = await store.read(RECORD_FILES.events);
  if (!text.ok) return text;
  if (text.value === undefined) return ok([]);
  const events = parseEvents(text.value);
  if (!events.ok) return err(failure('invalid', `events ${events.error.detail}`));
  return ok(events.value.flatMap((entry) => (entry.kind === 'descendant' ? [entry.process] : [])));
}

// The interval walk of parent links that records every descendant seen.
export async function recordDescendants(dependencies: SupervisorDependencies, child: Child, seen: ProcessIdentity[]): Promise<void> {
  const listing = dependencies.platform.inspector.listing();
  if (!listing.ok) return;
  const family = new Set([child.pid]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const entry of listing.value) {
      if (!family.has(entry.parentPid) || family.has(entry.identity.pid)) continue;
      family.add(entry.identity.pid);
      grew = true;
      if (seen.some((known) => sameProcess(known, entry.identity))) continue;
      seen.push(entry.identity);
      await appendEvent(dependencies, { kind: 'descendant', process: entry.identity });
    }
  }
}

// macOS: the group is signalled only while its leader, the child, has not
// been reaped (contract section 8).
export async function cancelGroup(dependencies: SupervisorDependencies, child: Child, reaped: () => boolean): Promise<void> {
  if (reaped()) return;
  dependencies.spawner.signalGroup(child.pid, 'SIGTERM');
  await appendEvent(dependencies, { kind: 'cancellation', step: 'terminate-sent' });
  await dependencies.sleep(dependencies.timing.graceMilliseconds);
  if (reaped()) return;
  dependencies.spawner.signalGroup(child.pid, 'SIGKILL');
  await appendEvent(dependencies, { kind: 'cancellation', step: 'kill-sent' });
}

// A kill that failed is not evidence; the caller tries again next poll.
export async function killContainment(dependencies: SupervisorDependencies, containment: Containment): Promise<boolean> {
  if (!containment.kill().ok) return false;
  await appendEvent(dependencies, { kind: 'cancellation', step: 'containment-killed' });
  return true;
}

// Waits until the containment empties, killing it on a cancellation. One
// that stays unreadable ends the wait without proof, so recovery decides.
export async function awaitEmptyContainment(dependencies: SupervisorDependencies, containment: Containment): Promise<'empty' | 'unreadable'> {
  let cancelled = false;
  for (let unreadable = 0; ; await dependencies.sleep(dependencies.timing.pollMilliseconds)) {
    const populated = containment.populated();
    if (populated.ok && !populated.value) return 'empty';
    unreadable = populated.ok ? 0 : unreadable + 1;
    if (unreadable >= dependencies.timing.unreadablePolls) return 'unreadable';
    if (!cancelled && (await cancellationRequested(dependencies.store))) cancelled = await killContainment(dependencies, containment);
  }
}

// macOS: after the reap, the set is empty only by one listing and the
// recorded descendants; without both readable, nothing is proven.
export async function awaitDarwinTermination(dependencies: SupervisorDependencies, child: Child): Promise<'proven' | 'unprovable'> {
  let reported = false;
  for (let unreadable = 0; ; await dependencies.sleep(dependencies.timing.pollMilliseconds)) {
    const listing = dependencies.platform.inspector.listing();
    const descendants = await recordedDescendants(dependencies.store);
    if (!listing.ok || !descendants.ok) {
      unreadable += 1;
      if (unreadable >= dependencies.timing.unreadablePolls) return 'unprovable';
      continue;
    }
    unreadable = 0;
    const proof = proveDarwinTermination({ processGroupId: child.pid, listing: listing.value, recordedDescendants: descendants.value });
    if (proof.proven) return 'proven';
    if (!reported) await appendEvent(dependencies, { kind: 'survivors', processes: proof.survivors });
    reported = true;
  }
}

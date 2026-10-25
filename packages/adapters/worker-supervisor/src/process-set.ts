import { err, failure, ok, type Result } from '@taskelith/kernel';
import { encodeEvent, parseEvents } from './event-log.js';
import { sameProcess, type ProcessIdentity } from './process-identity.js';
import type { Containment, RecordStore } from './ports.js';
import { RECORD_FILES, type EventEntry } from './record.js';
import { cancellationRequested, persist, type SupervisorDependencies } from './supervisor-session.js';
import { proveDarwinTermination, type TerminationProof } from './termination.js';

// The child leads its own process group, so its process ID is the group ID.
export interface Child {
  readonly pid: number;
}

// A torn last entry is cut off before the next one is written, so that it
// can never join the new entry into a damaged one.
export async function appendEvent(dependencies: SupervisorDependencies, entry: EventEntry): Promise<void> {
  await persist(dependencies, () => writeEvent(dependencies.store, entry));
}

async function writeEvent(store: RecordStore, entry: EventEntry): Promise<Result<void>> {
  const frame = encodeEvent(entry);
  const text = await store.read(RECORD_FILES.events);
  if (!text.ok) return text;
  const current = text.value ?? '';
  if (current === '' || current.endsWith('\n')) return store.append(RECORD_FILES.events, frame);
  return store.replace(RECORD_FILES.events, current.slice(0, current.lastIndexOf('\n') + 1) + frame);
}

export async function recordedDescendants(store: RecordStore): Promise<Result<ProcessIdentity[]>> {
  const text = await store.read(RECORD_FILES.events);
  if (!text.ok) return text;
  if (text.value === undefined) return ok([]);
  const events = parseEvents(text.value);
  if (!events.ok) return err(failure('invalid', `events ${events.error.detail}`));
  return ok(events.value.flatMap((entry) => (entry.kind === 'descendant' ? [entry.process] : [])));
}

// The interval walk of parent links that records every descendant seen; a
// failed write ends this walk, and the next one records the process again.
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
      if (!(await writeEvent(dependencies.store, { kind: 'descendant', process: entry.identity })).ok) return;
      seen.push(entry.identity);
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

// The kernel copies each entry after it took the process IDs, so a member
// can fork and be reaped unseen; a second listing narrows that race.
const EMPTY_LISTINGS = 2;

// macOS: after the reap, the set is empty only by consecutive listings and
// the recorded descendants; without both readable, nothing is proven.
export async function awaitDarwinTermination(dependencies: SupervisorDependencies, child: Child): Promise<'proven' | 'unprovable'> {
  let reported = false;
  for (let unreadable = 0; ; await dependencies.sleep(dependencies.timing.pollMilliseconds)) {
    const proof = await proveByConsecutiveListings(dependencies, child);
    if (proof?.proven === true) return 'proven';
    if (proof === undefined) {
      unreadable += 1;
      if (unreadable >= dependencies.timing.unreadablePolls) return 'unprovable';
      continue;
    }
    unreadable = 0;
    if (!reported) await appendEvent(dependencies, { kind: 'survivors', processes: proof.survivors });
    reported = true;
  }
}

// Proven only when EMPTY_LISTINGS listings in a row prove it; otherwise the
// first one that does not.
async function proveByConsecutiveListings(dependencies: SupervisorDependencies, child: Child): Promise<TerminationProof | undefined> {
  for (let listings = 1; ; listings += 1) {
    const proof = await proveFromListing(dependencies, child);
    if (proof?.proven !== true || listings === EMPTY_LISTINGS) return proof;
  }
}

// Undefined when the listing or the recorded descendants cannot be read.
async function proveFromListing(dependencies: SupervisorDependencies, child: Child): Promise<TerminationProof | undefined> {
  const listing = dependencies.platform.inspector.listing();
  const descendants = await recordedDescendants(dependencies.store);
  if (!listing.ok || !descendants.ok) return undefined;
  return proveDarwinTermination({ processGroupId: child.pid, listing: listing.value, recordedDescendants: descendants.value });
}

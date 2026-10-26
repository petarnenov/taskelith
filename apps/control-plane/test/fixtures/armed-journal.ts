import * as journal from '@taskelith/worker-journal';
import type { WorkerRootOptions } from '@taskelith/worker-journal';
import { reachCrashPoint } from './crash-hook.ts';

// Stands in for @taskelith/worker-journal in a composed worker: the real
// journal, with its commit points W1 to W6 wired to the armed crash point.
export * from '@taskelith/worker-journal';

// The start or exit fact and its outbox row commit together, so the read
// and outbox steps CP10 and CP12 end with these (supervisor contract, 4).
const OUTBOXED_READS: ReadonlyMap<string, string> = new Map([['W5s.after', 'CP10'], ['W5e.after', 'CP12']]);

function reachCommitPoint(point: string): void {
  reachCrashPoint(point);
  const read = OUTBOXED_READS.get(point);
  if (read !== undefined) reachCrashPoint(read);
}

function armed(options: WorkerRootOptions): WorkerRootOptions {
  return { ...options, onCommitPoint: reachCommitPoint };
}

export function openWorkerRoot(options: WorkerRootOptions): ReturnType<typeof journal.openWorkerRoot> {
  return journal.openWorkerRoot(armed(options));
}

export function claimWorkerRoot(options: WorkerRootOptions): ReturnType<typeof journal.claimWorkerRoot> {
  return journal.claimWorkerRoot(armed(options));
}

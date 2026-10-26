import * as journal from '@taskelith/worker-journal';
import type { WorkerRootOptions } from '@taskelith/worker-journal';
import { reachCrashPoint } from './crash-hook.ts';

// Stands in for @taskelith/worker-journal in a composed worker: the real
// journal, with its commit points W1 to W6 wired to the armed crash point.
export * from '@taskelith/worker-journal';

function armed(options: WorkerRootOptions): WorkerRootOptions {
  return { ...options, onCommitPoint: reachCrashPoint };
}

export function openWorkerRoot(options: WorkerRootOptions): ReturnType<typeof journal.openWorkerRoot> {
  return journal.openWorkerRoot(armed(options));
}

export function claimWorkerRoot(options: WorkerRootOptions): ReturnType<typeof journal.claimWorkerRoot> {
  return journal.claimWorkerRoot(armed(options));
}

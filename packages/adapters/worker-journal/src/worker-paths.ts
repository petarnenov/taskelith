import { join } from 'node:path';

// The `worker/` subtree of the worker journal contract, section 2.
export interface WorkerPaths {
  readonly dataRoot: string;
  readonly worker: string;
  readonly lock: string;
  readonly identity: string;
  readonly journalDirectory: string;
  readonly journal: string;
  readonly executions: string;
  readonly logs: string;
  readonly workspaces: string;
}

export const JOURNAL_FILE = 'journal.sqlite';

export function workerPaths(dataRoot: string): WorkerPaths {
  const worker = join(dataRoot, 'worker');
  const journalDirectory = join(worker, 'journal');
  return Object.freeze({
    dataRoot,
    worker,
    lock: join(worker, 'lock'),
    identity: join(worker, 'identity'),
    journalDirectory,
    journal: join(journalDirectory, JOURNAL_FILE),
    executions: join(worker, 'executions'),
    logs: join(worker, 'logs'),
    workspaces: join(worker, 'workspaces'),
  });
}

import type { Result } from '@taskelith/kernel';
import type { UnrecordedProcess } from '../domain/reconciliation.js';

// Each consumed unrecorded-process observation of a worker (item 21d).
export interface UnrecordedProcesses {
  // A worker's observation recorded before changes nothing.
  record(process: UnrecordedProcess): Promise<Result<void>>;
}

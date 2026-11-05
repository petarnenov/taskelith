import type { WorkersView } from './workers';
import { useSnapshot, type Snapshot, type SnapshotState } from './useSnapshot';
import { useWorkersGateway } from './WorkersServices';

// The workers view: one snapshot, read again on Refresh.
export type WorkersState = SnapshotState<WorkersView>;
export type Workers = Snapshot<WorkersView>;

export function useWorkers(): Workers {
  const { listWorkers } = useWorkersGateway();
  return useSnapshot(listWorkers);
}

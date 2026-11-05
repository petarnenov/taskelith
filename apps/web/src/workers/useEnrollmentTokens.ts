import type { EnrollmentTokenList } from './workers';
import { useSnapshot, type Snapshot, type SnapshotState } from './useSnapshot';
import { useWorkersGateway } from './WorkersServices';

// The pending tokens, every page: one snapshot, read again on Refresh and
// after every command that changed the list.
export type EnrollmentTokensState = SnapshotState<EnrollmentTokenList>;
export type EnrollmentTokens = Snapshot<EnrollmentTokenList>;

export function useEnrollmentTokens(): EnrollmentTokens {
  const { listEnrollmentTokens } = useWorkersGateway();
  return useSnapshot(listEnrollmentTokens);
}

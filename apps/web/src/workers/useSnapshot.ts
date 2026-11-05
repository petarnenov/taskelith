import { useCallback, useEffect, useState } from 'react';
import type { ReadFailed, ReadResult } from '../api/read-result';

// One snapshot of a read, read again on refresh, which keeps the shown
// value until the answer; a failed one replaces it, never a stale one.
export type SnapshotState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly failure: ReadFailed }
  | { readonly status: 'shown'; readonly view: T; readonly refreshing: boolean };

export interface Snapshot<T> {
  readonly state: SnapshotState<T>;
  readonly refresh: () => void;
}

export function useSnapshot<T>(read: () => Promise<ReadResult<T>>): Snapshot<T> {
  const [state, setState] = useState<SnapshotState<T>>({ status: 'loading' });
  const [loads, setLoads] = useState(0);

  // The cleanup drops the answer of a read that an unmount or a later
  // refresh overtook.
  useEffect(() => {
    let current = true;
    setState(whileRead);
    void read().then((result) => {
      if (!current) return;
      setState(result.kind === 'read' ? { status: 'shown', view: result.value, refreshing: false } : { status: 'failed', failure: result });
    });
    return () => {
      current = false;
    };
  }, [read, loads]);

  // Marked at once, so no render shows the old value as the fresh one.
  const refresh = useCallback(() => {
    setState(whileRead);
    setLoads((count) => count + 1);
  }, []);
  return { state, refresh };
}

function whileRead<T>(shown: SnapshotState<T>): SnapshotState<T> {
  return shown.status === 'shown' ? { ...shown, refreshing: true } : { status: 'loading' };
}

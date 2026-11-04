import { useCallback, useEffect, useState } from 'react';
import type { ReadFailed } from '../api/read-result';
import type { WorkersView } from './workers';
import { useWorkersGateway } from './WorkersServices';

// The workers view: one snapshot, read again on Refresh, which keeps the
// shown view until the answer; a failed one replaces it, never a stale one.
export type WorkersState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly failure: ReadFailed }
  | { readonly status: 'shown'; readonly view: WorkersView; readonly refreshing: boolean };

export interface Workers {
  readonly state: WorkersState;
  readonly refresh: () => void;
}

export function useWorkers(): Workers {
  const gateway = useWorkersGateway();
  const [state, setState] = useState<WorkersState>({ status: 'loading' });
  const [loads, setLoads] = useState(0);

  useEffect(() => {
    let current = true;
    setState((shown) => (shown.status === 'shown' ? { ...shown, refreshing: true } : { status: 'loading' }));
    void gateway.listWorkers().then((result) => {
      if (!current) return;
      setState(result.kind === 'read' ? { status: 'shown', view: result.value, refreshing: false } : { status: 'failed', failure: result });
    });
    return () => {
      current = false;
    };
  }, [gateway, loads]);

  const refresh = useCallback(() => setLoads((count) => count + 1), []);
  return { state, refresh };
}

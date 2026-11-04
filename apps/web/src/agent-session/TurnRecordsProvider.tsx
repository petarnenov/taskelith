import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useSession } from '../session/SessionProvider';
import type { TurnRecordStore } from './turn-records';

const TurnRecordsContext = createContext<TurnRecordStore | undefined>(undefined);

interface TurnRecordsProviderProps {
  readonly store: TurnRecordStore;
  readonly children: ReactNode;
}

// The retry records live as long as the shell's session: a signed-out
// shell, after a logout, an expiry, or a 401, drops those of every session.
export function TurnRecordsProvider({ store, children }: TurnRecordsProviderProps) {
  const { view } = useSession();
  const signedOut = view.status === 'signed-out';
  useEffect(() => {
    if (signedOut) store.clearAll();
  }, [signedOut, store]);
  return <TurnRecordsContext.Provider value={store}>{children}</TurnRecordsContext.Provider>;
}

export function useTurnRecords(): TurnRecordStore {
  const store = useContext(TurnRecordsContext);
  if (store === undefined) throw new Error('useTurnRecords needs a TurnRecordsProvider.');
  return store;
}

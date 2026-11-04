import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useSession } from '../session/SessionProvider';
import type { TurnRecordStore } from './turn-records';

interface TurnRecords {
  readonly store: TurnRecordStore;
  // The last sign-out dropped a submission whose answer was not seen.
  readonly dropped: boolean;
}

const TurnRecordsContext = createContext<TurnRecords | undefined>(undefined);

interface TurnRecordsProviderProps {
  readonly store: TurnRecordStore;
  readonly children: ReactNode;
}

// The retry records live as long as the shell's session: a signed-out
// shell, after a logout, an expiry, or a 401, drops those of every session.
export function TurnRecordsProvider({ store, children }: TurnRecordsProviderProps) {
  const { view } = useSession();
  const signedOut = view.status === 'signed-out';
  const [dropped, setDropped] = useState(false);
  // A drop holds while the shell stays signed out, also when StrictMode
  // runs the effect twice; the next sign-in forgets it.
  useEffect(() => {
    if (signedOut) setDropped((was) => was || store.clearAll());
    else setDropped(false);
  }, [signedOut, store]);
  return <TurnRecordsContext.Provider value={{ store, dropped }}>{children}</TurnRecordsContext.Provider>;
}

export function useTurnRecords(): TurnRecordStore {
  return useTurnRecordsContext().store;
}

// Whether the sign-in page should say that the last turn may not have been
// sent (coordinator decision on Q3 and Q4, 2026-11-04).
export function useDroppedTurns(): boolean {
  return useTurnRecordsContext().dropped;
}

function useTurnRecordsContext(): TurnRecords {
  const records = useContext(TurnRecordsContext);
  if (records === undefined) throw new Error('useTurnRecords needs a TurnRecordsProvider.');
  return records;
}

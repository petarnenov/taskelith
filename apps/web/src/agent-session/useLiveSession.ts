import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Turn } from '../board/board';
import { useBoardServices } from '../board/BoardServices';
import { sessionAddress } from './session-address';
import { startSessionFeed, type SessionFeed, type SessionFeedState } from './session-feed';

export interface LiveSession {
  readonly state: SessionFeedState;
  readonly retry: () => void;
  readonly loadEarlier: () => void;
  readonly showTurn: (turn: Turn) => void;
}

const LOADING: SessionFeedState = { status: 'loading' };

interface ShownState {
  readonly key: string;
  readonly state: SessionFeedState;
}

// The agent session, kept current by the project's event stream while
// shown; a state of another session is never returned.
export function useLiveSession(projectId: string, sessionId: string): LiveSession {
  const { gateway, clock } = useBoardServices();
  const key = sessionAddress(projectId, sessionId);
  const [shown, setShown] = useState<ShownState>({ key, state: LOADING });
  const [loads, setLoads] = useState(0);
  const feed = useRef<SessionFeed | undefined>(undefined);

  useEffect(() => {
    setShown({ key, state: LOADING });
    const show = (state: SessionFeedState) => setShown({ key, state });
    const started = startSessionFeed({ projectId, sessionId, gateway, clock, show });
    feed.current = started;
    return started.stop;
  }, [key, projectId, sessionId, gateway, clock, loads]);

  const retry = useCallback(() => setLoads((count) => count + 1), []);
  const loadEarlier = useCallback(() => feed.current?.loadEarlier(), []);
  const showTurn = useCallback((turn: Turn) => feed.current?.showTurn(turn), []);
  const state = shown.key === key ? shown.state : LOADING;
  return useMemo(() => ({ state, retry, loadEarlier, showTurn }), [state, retry, loadEarlier, showTurn]);
}

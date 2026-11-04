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

// The feed of one session address and one load of it.
interface StartedFeed {
  readonly key: string;
  readonly loads: number;
  readonly feed: SessionFeed;
}

// The agent session, kept current by the project's event stream while
// shown; a state of another session is never returned.
export function useLiveSession(projectId: string, sessionId: string): LiveSession {
  const { gateway, clock } = useBoardServices();
  const key = sessionAddress(projectId, sessionId);
  const [shown, setShown] = useState<ShownState>({ key, state: LOADING });
  const [loads, setLoads] = useState(0);
  const started = useRef<StartedFeed | undefined>(undefined);

  useEffect(() => {
    setShown({ key, state: LOADING });
    const show = (state: SessionFeedState) => setShown({ key, state });
    const feed = startSessionFeed({ projectId, sessionId, gateway, clock, show });
    started.current = { key, loads, feed };
    return feed.stop;
  }, [key, projectId, sessionId, gateway, clock, loads]);

  const retry = useCallback(() => setLoads((count) => count + 1), []);
  const loadEarlier = useCallback(() => started.current?.feed.loadEarlier(), []);
  // Bound to the feed of its session and load: a submission answered after
  // a move to another session, or a reload of this one, amends neither.
  const showTurn = useCallback(
    (turn: Turn) => {
      const current = started.current;
      if (current?.key === key && current.loads === loads) current.feed.showTurn(turn);
    },
    [key, loads],
  );
  const state = shown.key === key ? shown.state : LOADING;
  return useMemo(() => ({ state, retry, loadEarlier, showTurn }), [state, retry, loadEarlier, showTurn]);
}

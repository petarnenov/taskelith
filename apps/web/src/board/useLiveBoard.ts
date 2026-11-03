import { useCallback, useEffect, useState } from 'react';
import { startBoardFeed, type BoardFeedState } from './board-feed';
import { useBoardServices } from './BoardServices';

export interface LiveBoard {
  readonly state: BoardFeedState;
  readonly retry: () => void;
}

const LOADING: BoardFeedState = { status: 'loading' };

interface ShownState {
  readonly projectId?: string;
  readonly state: BoardFeedState;
}

// The project's board, kept current by its event stream while shown; a
// state of another project is never returned, and no project reads none.
export function useLiveBoard(projectId: string | undefined): LiveBoard {
  const { gateway, clock } = useBoardServices();
  const [shown, setShown] = useState<ShownState>({ state: LOADING });
  const [loads, setLoads] = useState(0);

  useEffect(() => {
    setShown({ projectId, state: LOADING });
    if (projectId === undefined) return undefined;
    const show = (state: BoardFeedState) => setShown({ projectId, state });
    return startBoardFeed({ projectId, gateway, clock, show });
  }, [projectId, gateway, clock, loads]);

  const retry = useCallback(() => setLoads((count) => count + 1), []);
  return { state: shown.projectId === projectId ? shown.state : LOADING, retry };
}

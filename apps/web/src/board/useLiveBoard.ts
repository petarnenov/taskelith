import { useCallback, useEffect, useState } from 'react';
import { startBoardFeed, type BoardFeedState } from './board-feed';
import { useBoardServices } from './BoardServices';

export interface LiveBoard {
  readonly state: BoardFeedState;
  readonly retry: () => void;
}

// The project's board, kept current by its event stream while shown.
export function useLiveBoard(projectId: string): LiveBoard {
  const { gateway, clock } = useBoardServices();
  const [state, setState] = useState<BoardFeedState>({ status: 'loading' });
  const [loads, setLoads] = useState(0);

  useEffect(() => {
    setState({ status: 'loading' });
    return startBoardFeed({ projectId, gateway, clock, show: setState });
  }, [projectId, gateway, clock, loads]);

  const retry = useCallback(() => setLoads((count) => count + 1), []);
  return { state, retry };
}

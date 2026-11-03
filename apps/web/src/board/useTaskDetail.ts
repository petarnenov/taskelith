import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardCard } from './board';
import type { BoardView } from './board-model';
import { startTaskDetailFeed, type TaskDetailFeed, type TaskDetailState } from './task-detail-feed';
import { useBoardServices } from './BoardServices';

export interface LiveTaskDetail {
  readonly state: TaskDetailState;
  readonly retry: () => void;
}

// The card's task detail, read again when the live board under it shows a
// new state of the card; without a board view it is one snapshot.
export function useTaskDetail(projectId: string, runId: string, board: BoardView | undefined): LiveTaskDetail {
  const { gateway } = useBoardServices();
  const [state, setState] = useState<TaskDetailState>({ status: 'loading' });
  const [loads, setLoads] = useState(0);
  const feed = useRef<TaskDetailFeed | undefined>(undefined);
  const seenCard = useRef<BoardCard | undefined>(undefined);

  useEffect(() => {
    setState({ status: 'loading' });
    const started = startTaskDetailFeed({ projectId, runId, gateway, show: setState });
    feed.current = started;
    return started.stop;
  }, [projectId, runId, gateway, loads]);

  const card = board?.board.cards.find((known) => known.runId === runId);
  const position = board?.board.position;
  useEffect(() => {
    if (card === undefined || position === undefined || card === seenCard.current) return;
    seenCard.current = card;
    feed.current?.cardChanged(position);
  }, [card, position]);

  const retry = useCallback(() => setLoads((count) => count + 1), []);
  return { state, retry };
}

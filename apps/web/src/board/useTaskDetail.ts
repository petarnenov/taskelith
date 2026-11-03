import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardCard } from './board';
import type { ShownBoard } from './board-feed';
import { startTaskDetailFeed, type TaskDetailFeed, type TaskDetailState } from './task-detail-feed';
import { useBoardServices } from './BoardServices';

export interface LiveTaskDetail {
  readonly state: TaskDetailState;
  readonly retry: () => void;
}

// The card's task detail, read again when the live board under it shows a
// new state of the card or a new snapshot; without a board, one snapshot.
export function useTaskDetail(projectId: string, runId: string, board: ShownBoard | undefined): LiveTaskDetail {
  const { gateway } = useBoardServices();
  const [state, setState] = useState<TaskDetailState>({ status: 'loading' });
  const [loads, setLoads] = useState(0);
  const feed = useRef<TaskDetailFeed | undefined>(undefined);
  const seenCard = useRef<BoardCard | undefined>(undefined);
  const seenSnapshot = useRef<number | undefined>(undefined);

  useEffect(() => {
    setState({ status: 'loading' });
    // A new feed compares with no board seen before it, whose snapshot
    // numbers a restarted board feed may repeat.
    seenSnapshot.current = undefined;
    seenCard.current = undefined;
    const started = startTaskDetailFeed({ projectId, runId, gateway, show: setState });
    feed.current = started;
    return started.stop;
  }, [projectId, runId, gateway, loads]);

  const card = board?.view.board.cards.find((known) => known.runId === runId);
  const position = board?.view.board.position;
  const snapshot = board?.snapshot;
  useEffect(() => {
    if (snapshot === undefined || position === undefined) return;
    const firstSnapshot = seenSnapshot.current === undefined;
    const newSnapshot = !firstSnapshot && snapshot !== seenSnapshot.current;
    seenSnapshot.current = snapshot;
    if (newSnapshot) {
      seenCard.current = card;
      feed.current?.boardReread();
    } else if (card !== undefined && card !== seenCard.current) {
      seenCard.current = card;
      feed.current?.cardChanged(position);
    }
  }, [card, position, snapshot]);

  const retry = useCallback(() => setLoads((count) => count + 1), []);
  return { state, retry };
}

import type { Clock } from '../session/clock';
import type { BoardGateway } from './board';
import { applyChange, viewOf, type BoardView } from './board-model';
import { startLiveFeed, type LiveFeedState, type ShownView } from './live-feed';

export {
  MAX_CHANGES_DURING_READ,
  RESYNC_DELAY_MILLISECONDS,
  STREAM_RETRY_MILLISECONDS,
  type Liveness,
} from './live-feed';

export type BoardFeedState = LiveFeedState<BoardView>;

export type ShownBoard = ShownView<BoardView>;

interface BoardFeedOptions {
  readonly projectId: string;
  readonly gateway: BoardGateway;
  readonly clock: Clock;
  readonly show: (state: BoardFeedState) => void;
}

// Reads the board, then follows its event stream from the snapshot's
// position through the shared live feed; returns the function that stops it.
export function startBoardFeed({ projectId, gateway, clock, show }: BoardFeedOptions): () => void {
  const feed = startLiveFeed<BoardView>({
    source: {
      read: async () => {
        const result = await gateway.readBoard(projectId);
        return result.kind === 'read' ? { kind: 'read', value: viewOf(result.value) } : result;
      },
      positionOf: (view) => view.board.position,
      apply: applyChange,
    },
    openEvents: (after, listener) => gateway.openEvents(projectId, after, listener),
    clock,
    show,
  });
  return feed.stop;
}

import type { BoardGateway, ReadFailed, TaskDetail } from './board';
import { isAfter } from './board-model';

export type TaskDetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly failure: ReadFailed }
  | { readonly status: 'shown'; readonly detail: TaskDetail };

export interface TaskDetailFeed {
  // The board saw the card change at this position.
  readonly cardChanged: (position: string) => void;
  // The board read a new snapshot, whose positions may lie below the
  // detail's after a restore (wire contracts section 10).
  readonly boardReread: () => void;
  readonly stop: () => void;
}

interface TaskDetailFeedOptions {
  readonly projectId: string;
  readonly runId: string;
  readonly gateway: BoardGateway;
  readonly show: (state: TaskDetailState) => void;
}

// Reads the task detail, and again whenever the board sees its card change
// above the detail's position; one read runs at a time.
export function startTaskDetailFeed({ projectId, runId, gateway, show }: TaskDetailFeedOptions): TaskDetailFeed {
  let stopped = false;
  let reading = false;
  let detail: TaskDetail | undefined;
  // The latest change the board saw while a read ran.
  let changedDuringRead: string | undefined;
  let rereadDuringRead = false;

  async function read(): Promise<void> {
    reading = true;
    const result = await gateway.readTaskDetail(projectId, runId);
    reading = false;
    if (stopped) return;
    const changedAt = changedDuringRead;
    const reread = rereadDuringRead;
    changedDuringRead = undefined;
    rereadDuringRead = false;
    if (result.kind !== 'read') {
      detail = undefined;
      show({ status: 'failed', failure: result });
      return;
    }
    detail = result.value;
    show({ status: 'shown', detail });
    if (reread) void read();
    else if (changedAt !== undefined) cardChanged(changedAt);
  }

  // A failed read drops the detail, so only a retry, a new feed, reads.
  function cardChanged(position: string): void {
    if (stopped) return;
    if (reading) changedDuringRead = latest(changedDuringRead, position);
    else if (detail !== undefined && isAfter(position, detail.position)) void read();
  }

  // Positions before the new snapshot no longer compare with its own.
  function boardReread(): void {
    if (stopped) return;
    changedDuringRead = undefined;
    if (reading) rereadDuringRead = true;
    else if (detail !== undefined) void read();
  }

  void read();
  return {
    cardChanged,
    boardReread,
    stop: () => {
      stopped = true;
    },
  };
}

function latest(known: string | undefined, position: string): string {
  return known === undefined || isAfter(position, known) ? position : known;
}

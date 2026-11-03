import type { components } from '../generated/control-plane';

// The board as the SPA reads it: the control plane's view types, and the
// outcomes of a read and of the event stream, free of HTTP and EventSource.

type Schemas = components['schemas'];

export type Board = Schemas['Board'];
export type BoardCard = Schemas['BoardCard'];
export type BoardColumn = Schemas['BoardColumn'];
export type GateState = Schemas['GateState'];
export type StageOrigin = Schemas['StageOrigin'];
export type StageState = Schemas['StageState'];
export type CardWait = Schemas['CardWait'];
export type MergeGateState = Schemas['MergeGateState'];
export type TaskEndKind = Schemas['TaskEndKind'];
export type WorkType = Schemas['WorkType'];
export type SessionActivity = Schemas['SessionActivity'];
export type SessionActivityState = SessionActivity['state'];
export type PlacementObstacle = Schemas['PlacementObstacle'];

export interface Project {
  readonly projectId: string;
  readonly name: string;
}

export type ReadFailure = 'unauthenticated' | 'denied' | 'not-found' | 'unavailable';

export type ReadResult<T> = { readonly kind: 'read'; readonly value: T } | { readonly kind: ReadFailure };

export interface CardChange {
  readonly kind: 'card-changed';
  readonly position: string;
  readonly occurredAt: string;
  readonly card: BoardCard;
}

export interface WorkersChange {
  readonly kind: 'board-changed';
  readonly position: string;
  readonly occurredAt: string;
  readonly workersOnline: number;
}

export type BoardChange = CardChange | WorkersChange;

// opened: the stream is connected; interrupted: the browser reconnects;
// failed: it closed for good, as after an error status.
export type StreamSignal = 'opened' | 'interrupted' | 'failed' | 'resync' | 'stream-ended';

export type BoardStreamEvent = BoardChange | { readonly [K in StreamSignal]: { readonly kind: K } }[StreamSignal];

export type BoardStreamListener = (event: BoardStreamEvent) => void;

export interface BoardGateway {
  readonly listProjects: () => Promise<ReadResult<readonly Project[]>>;
  readonly readBoard: (projectId: string) => Promise<ReadResult<Board>>;
  // Opens the project's event stream after a position; returns its close.
  readonly openEvents: (projectId: string, after: string, listener: BoardStreamListener) => () => void;
}

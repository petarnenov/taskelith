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
export type StageSummary = Schemas['StageSummary'];
export type CardWait = Schemas['CardWait'];
export type MergeGateState = Schemas['MergeGateState'];
export type TaskEndKind = Schemas['TaskEndKind'];
export type WorkType = Schemas['WorkType'];
export type SessionActivity = Schemas['SessionActivity'];
export type SessionActivityState = SessionActivity['state'];
export type PlacementObstacle = Schemas['PlacementObstacle'];
export type TaskDetail = Schemas['TaskDetail'];
export type StageView = Schemas['StageView'];
export type GateView = Schemas['GateView'];
export type EvidenceKind = Schemas['EvidenceKind'];
export type TraceLink = Schemas['TraceLink'];
export type EvidenceFreshness = Schemas['EvidenceFreshness'];
export type WorkflowRunBinding = Schemas['WorkflowRunBinding'];
export type TaskView = Schemas['TaskView'];
export type AdmissionState = Schemas['AdmissionState'];
export type TaskEnd = Schemas['TaskEnd'];
export type AttemptOutcome = Schemas['AttemptOutcome'];
export type AttemptOutcomeKind = AttemptOutcome['kind'];
export type AgentSession = Schemas['AgentSession'];
export type AgentSessionView = Schemas['AgentSessionView'];
export type AgentSessionPage = Schemas['AgentSessionPage'];
export type Turn = Schemas['Turn'];
export type TurnPage = Schemas['TurnPage'];
export type TurnState = Schemas['TurnState'];
export type TurnOutcome = Schemas['TurnOutcome'];
export type HarnessFailure = Schemas['HarnessFailure'];
export type TurnAuthor = Schemas['TurnAuthor'];

export interface Project {
  readonly projectId: string;
  readonly name: string;
}

export type ReadFailure = 'unauthenticated' | 'denied' | 'not-found' | 'unavailable';

// A 403 names the role it needs, when the control plane says which.
export type ReadFailed =
  | { readonly kind: Exclude<ReadFailure, 'denied'> }
  | { readonly kind: 'denied'; readonly requiredRole?: string };

export type ReadResult<T> = { readonly kind: 'read'; readonly value: T } | ReadFailed;

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

export interface SessionChange {
  readonly kind: 'agent-session-changed';
  readonly position: string;
  readonly occurredAt: string;
  readonly session: AgentSession;
}

export interface TurnChange {
  readonly kind: 'turn-changed';
  readonly position: string;
  readonly occurredAt: string;
  readonly sessionId: string;
  readonly turn: Turn;
}

// Every stamped event the stream delivers; each feed applies its own.
export type StreamChange = BoardChange | SessionChange | TurnChange;

// opened: the stream is connected; interrupted: the browser reconnects;
// failed: it closed for good, as after an error status.
export type StreamSignal = 'opened' | 'interrupted' | 'failed' | 'resync' | 'stream-ended';

export type BoardStreamEvent = StreamChange | { readonly [K in StreamSignal]: { readonly kind: K } }[StreamSignal];

export type BoardStreamListener = (event: BoardStreamEvent) => void;

export interface BoardGateway {
  readonly listProjects: () => Promise<ReadResult<readonly Project[]>>;
  readonly readBoard: (projectId: string) => Promise<ReadResult<Board>>;
  readonly readTaskDetail: (projectId: string, runId: string) => Promise<ReadResult<TaskDetail>>;
  readonly listAgentSessions: (projectId: string, runId: string) => Promise<ReadResult<readonly AgentSession[]>>;
  readonly readAgentSession: (projectId: string, sessionId: string) => Promise<ReadResult<AgentSessionView>>;
  // One page of the session's turns above the cursor, 0 for the first.
  readonly listAgentSessionTurns: (projectId: string, sessionId: string, after: number) => Promise<ReadResult<TurnPage>>;
  // Opens the project's event stream after a position; returns its close.
  readonly openEvents: (projectId: string, after: string, listener: BoardStreamListener) => () => void;
}

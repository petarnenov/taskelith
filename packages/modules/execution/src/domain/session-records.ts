import { err, failure, type FailureCode, type Instant, type Result } from '@taskelith/kernel';
import type { EvidenceReference, OwnershipGeneration, TaskId } from '@taskelith/sdlc';
import type { HarnessRequestKind } from '../ports/agent-harness-data.js';
import type { DelegationOutcome, HarnessFailure, PermissionDecision, TurnOutcome } from '../ports/agent-harness.js';
import type { StandingRuleId } from '../ports/standing-approval-rules.js';
import type {
  AttemptId,
  HarnessPluginId,
  IdempotencyKey,
  NativeRequestId,
  NativeSessionId,
  PrincipalId,
  SessionGeneration,
  SessionId,
  TurnId,
} from './identifiers.js';

// One task's session timeline (session timeline contract, section 3.1);
// the account slot stays in Scheduling's reservation.
export interface Session {
  readonly id: SessionId;
  readonly taskId: TaskId;
  readonly harness: HarnessPluginId;
  readonly nativeSessionId?: NativeSessionId;
  readonly attempts: readonly BoundAttempt[];
  readonly generations: readonly GenerationRun[];
  readonly turns: readonly Turn[];
  readonly requests: readonly NativeRequest[];
  readonly output: OutputWindow;
  readonly limit?: SessionLimit;
  readonly handoff?: Handoff;
}

export interface SessionStart {
  readonly id: SessionId;
  readonly taskId: TaskId;
  readonly harness: HarnessPluginId;
}

export interface BoundAttempt {
  readonly id: AttemptId;
  readonly ownershipGeneration: OwnershipGeneration;
  readonly ended: boolean;
}

export interface AttemptBinding {
  readonly attemptId: AttemptId;
  readonly taskId: TaskId;
  readonly ownershipGeneration: OwnershipGeneration;
}

export interface GenerationRun {
  readonly generation: SessionGeneration;
  readonly attemptId: AttemptId;
  readonly ended: boolean;
}

export interface GenerationStart {
  readonly generation: SessionGeneration;
  readonly nativeSessionId: NativeSessionId;
}

export const TURN_STATES = Object.freeze(['queued', 'delivered', 'ended', 'outcome-unknown'] as const);

export type TurnState = (typeof TURN_STATES)[number];

export interface TurnSubmission {
  readonly turnId: TurnId;
  readonly key: IdempotencyKey;
  readonly author: PrincipalId;
  readonly text: string;
}

export interface TurnIdentity {
  readonly id: TurnId;
  readonly key: IdempotencyKey;
  readonly author: PrincipalId;
  readonly text: string;
  readonly position: number;
}

export type TurnProgress =
  | { readonly state: 'queued' }
  | { readonly state: 'delivered'; readonly generation: SessionGeneration }
  | { readonly state: 'outcome-unknown'; readonly generation: SessionGeneration }
  | {
    readonly state: 'ended';
    readonly generation: SessionGeneration;
    readonly outcome: TurnOutcome;
    readonly failure?: HarnessFailure;
  };

export type Turn = TurnIdentity & TurnProgress;

export interface TurnSubmitted {
  readonly session: Session;
  readonly turn: Turn;
  readonly effect: 'recorded' | 'duplicate';
}

export interface TurnDelivery {
  readonly turnId: TurnId;
  readonly generation: SessionGeneration;
}

export interface TurnEnd {
  readonly turnId: TurnId;
  readonly generation: SessionGeneration;
  readonly outcome: TurnOutcome;
  readonly failure?: HarnessFailure;
}

// A request's identity within its session (agent harness port, 7.1).
export interface RequestKey {
  readonly generation: SessionGeneration;
  readonly nativeRequestId: NativeRequestId;
}

export interface RequestRecording {
  readonly key: RequestKey;
  readonly kind: HarnessRequestKind;
  readonly turnId: TurnId;
  readonly text: string;
}

export const REQUEST_STATES = Object.freeze(['open', 'answered', 'expired', 'unresolved'] as const);

export type RequestState = (typeof REQUEST_STATES)[number];

export type NativeRequest = RequestRecording & (
  | { readonly state: 'open' | 'expired' | 'unresolved' }
  | { readonly state: 'answered'; readonly response: ConsumedResponse }
);

export type Answer =
  | { readonly kind: 'permission'; readonly decision: PermissionDecision; readonly message?: string }
  | { readonly kind: 'input'; readonly text: string }
  | {
    readonly kind: 'delegation-result';
    readonly delegationId: string;
    readonly outcome: DelegationOutcome;
    readonly summary: string;
  };

export type Responder =
  | { readonly kind: 'principal'; readonly principalId: PrincipalId }
  | { readonly kind: 'standing-rule'; readonly ruleId: StandingRuleId };

export interface ResponseSubmission {
  readonly request: RequestKey;
  readonly answer: Answer;
  readonly responder: Responder;
  readonly attemptId: AttemptId;
  readonly ownershipGeneration: OwnershipGeneration;
}

export const DELIVERY_STATES = Object.freeze(['pending', 'delivered', 'refused', 'delivery-uncertain'] as const);

export type DeliveryState = (typeof DELIVERY_STATES)[number];

export type DeliveryReport = Exclude<DeliveryState, 'pending'>;

export interface ConsumedResponse {
  readonly answer: Answer;
  readonly responder: Responder;
  readonly attemptId: AttemptId;
  readonly ownershipGeneration: OwnershipGeneration;
  readonly delivery: DeliveryState;
}

export interface OutputAppend {
  readonly turnId: TurnId;
  readonly generation: SessionGeneration;
  readonly text: string;
}

export interface OutputEntry extends OutputAppend {
  readonly position: number;
}

export interface OutputWindow {
  readonly entries: readonly OutputEntry[];
  readonly retainedBytes: number;
  readonly lastPosition: number;
}

export type OutputRead =
  | { readonly kind: 'entries'; readonly entries: readonly OutputEntry[] }
  | { readonly kind: 'cursor-expired'; readonly earliestRetained: number };

export interface LimitSignal {
  readonly resetsAt?: Instant;
}

export interface SessionLimit {
  readonly resetsAt?: Instant;
}

// The host-written record a session stopped by a limit leaves its task.
export interface Handoff {
  readonly sessionId: SessionId;
  readonly taskId: TaskId;
  readonly harness: HarnessPluginId;
  readonly resetsAt?: Instant;
  readonly lastTurnWithOutcome?: TurnId;
  readonly unresolvedRequests: readonly RequestKey[];
  readonly evidence: EvidenceReference;
  readonly takenBy?: SessionId;
}

export function openSession(start: SessionStart): Session {
  return Object.freeze({
    id: start.id,
    taskId: start.taskId,
    harness: start.harness,
    attempts: Object.freeze([]),
    generations: Object.freeze([]),
    turns: Object.freeze([]),
    requests: Object.freeze([]),
    output: EMPTY_OUTPUT,
  });
}

export function activeBoundAttempt(session: Session): BoundAttempt | undefined {
  return session.attempts.find((attempt) => !attempt.ended);
}

export function isStopped(session: Session): boolean {
  return session.limit !== undefined;
}

export function runningGeneration(session: Session): GenerationRun | undefined {
  return session.generations.find((run) => !run.ended);
}

export function isRunningIn(turn: Turn, generation: SessionGeneration): boolean {
  return turn.state === 'delivered' && turn.generation === generation;
}

// Whether the turn is delivered in the session's running generation.
export function isLiveTurn(session: Session, turn: Turn, generation: SessionGeneration): boolean {
  return runningGeneration(session)?.generation === generation && isRunningIn(turn, generation);
}

export function withChanges(session: Session, changes: Partial<Session>): Session {
  return Object.freeze({ ...session, ...changes });
}

export function appended<T>(list: readonly T[], item: T): readonly T[] {
  return Object.freeze([...list, frozenCopy(item)]);
}

export function replaced<T>(list: readonly T[], index: number, item: T): readonly T[] {
  return Object.freeze(list.map((current, at) => (at === index ? frozenCopy(item) : current)));
}

// Copies plain caller data so that no caller keeps a mutable reference.
export function frozenCopy<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map((item: unknown) => frozenCopy(item))) as T;
  if (value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value).filter(([, field]) => field !== undefined);
  return Object.freeze(Object.fromEntries(entries.map(([name, field]) => [name, frozenCopy(field)]))) as T;
}

export function isTextWithin(text: string, minimum: number, maximum: number): boolean {
  return text.length >= minimum && text.length <= maximum;
}

export function sessionFailure(code: FailureCode, session: Session, message: string): Result<never> {
  return err(failure(code, `session ${session.id} ${message}`, { session: session.id }));
}

const EMPTY_OUTPUT: OutputWindow = Object.freeze({ entries: Object.freeze([]), retainedBytes: 0, lastPosition: 0 });

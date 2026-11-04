import type { AgentSession, AgentSessionPage, AgentSessionView, SessionChange, Turn, TurnChange, TurnPage } from './board';
import { isInstant, isKey, isPosition, isRecord, isText } from './board-wire';
import { HARNESS_FAILURE_LABELS, TURN_OUTCOME_LABELS, TURN_STATE_LABELS } from './session-labels';

// The agent session answers and events, checked for every field the
// session screen shows; anything else reads as an unreachable plane.

type Fields = Record<string, unknown>;

export function agentSessionViewOf(body: unknown): AgentSessionView | undefined {
  if (!isRecord(body) || !isSnapshot(body) || !isAgentSession(body.session)) return undefined;
  return body as unknown as AgentSessionView;
}

export function agentSessionPageOf(body: unknown): AgentSessionPage | undefined {
  if (!isRecord(body) || !isSnapshot(body) || !isListOf(body.sessions, isAgentSession)) return undefined;
  if (body.next !== undefined && !isText(body.next)) return undefined;
  return body as unknown as AgentSessionPage;
}

export function turnPageOf(body: unknown): TurnPage | undefined {
  if (!isRecord(body) || !isSnapshot(body) || !isListOf(body.turns, isTurn)) return undefined;
  if (body.next !== undefined && !isTimelinePosition(body.next)) return undefined;
  return body as unknown as TurnPage;
}

export function sessionChangeOf(data: unknown): SessionChange | undefined {
  if (!isRecord(data) || data.type !== 'agent-session-changed' || !isStamped(data)) return undefined;
  if (!isAgentSession(data.session)) return undefined;
  const { position, occurredAt } = data as { position: string; occurredAt: string };
  return { kind: 'agent-session-changed', position, occurredAt, session: data.session };
}

export function turnChangeOf(data: unknown): TurnChange | undefined {
  if (!isRecord(data) || data.type !== 'turn-changed' || !isStamped(data) || !isText(data.sessionId)) return undefined;
  if (!isTurn(data.turn)) return undefined;
  const { position, occurredAt, sessionId } = data as { position: string; occurredAt: string; sessionId: string };
  return { kind: 'turn-changed', position, occurredAt, sessionId, turn: data.turn };
}

export function isAgentSession(value: unknown): value is AgentSession {
  if (!isRecord(value) || !isText(value.sessionId) || !isText(value.taskId) || !isText(value.runId)) return false;
  if (!isText(value.harness) || !isTimelineCursor(value.lastTurnPosition) || !isTimelineCursor(value.lastRequestPosition)) return false;
  if (!isOutputWindow(value.output) || !isOptional(value.runningGeneration, isTimelinePosition)) return false;
  if (!isOptional(value.limit, isLimit) || !isOptional(value.activeAttempt, isActiveAttempt)) return false;
  return isOptional(value.handoff, isHandoff);
}

export function isTurn(value: unknown): value is Turn {
  if (!isRecord(value) || !isText(value.turnId) || !isTimelinePosition(value.position)) return false;
  if (!isAuthor(value.author) || typeof value.text !== 'string' || !isKey(TURN_STATE_LABELS, value.state)) return false;
  if (value.state === 'queued') return true;
  if (!isTimelinePosition(value.generation)) return false;
  if (value.state !== 'ended') return true;
  if (!isKey(TURN_OUTCOME_LABELS, value.outcome)) return false;
  return value.outcome !== 'failed' || isKey(HARNESS_FAILURE_LABELS, value.failure);
}

function isAuthor(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === 'principal') return isText(value.principalId);
  return value.kind === 'host' && isRequestKey(value.delegationRequest);
}

function isRequestKey(value: unknown): boolean {
  return isRecord(value) && isTimelinePosition(value.generation) && isText(value.nativeRequestId);
}

function isOutputWindow(value: unknown): boolean {
  if (!isRecord(value) || !isTimelineCursor(value.lastPosition)) return false;
  return isOptional(value.earliestRetained, isTimelinePosition);
}

function isLimit(value: unknown): boolean {
  return isRecord(value) && isOptional(value.resetsAt, isInstant);
}

function isActiveAttempt(value: unknown): boolean {
  return isRecord(value) && isText(value.attemptId) && isTimelinePosition(value.ownershipGeneration);
}

function isHandoff(value: unknown): boolean {
  if (!isRecord(value) || typeof value.evidence !== 'string' || !isListOf(value.unresolvedRequests, isRequestKey)) {
    return false;
  }
  if (!isOptional(value.resetsAt, isInstant) || !isOptional(value.lastTurnWithOutcome, isText)) return false;
  return isOptional(value.takenBy, isText);
}

// Cursors count from 0 and positions and generations from 1, each at most
// the largest safe integer, as the OpenAPI schemas cap them.
function isTimelineCursor(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isTimelinePosition(value: unknown): value is number {
  return isTimelineCursor(value) && value >= 1;
}

function isSnapshot(value: Fields): boolean {
  return isInstant(value.asOf) && isPosition(value.position);
}

function isStamped(value: Fields): boolean {
  return isInstant(value.occurredAt) && isPosition(value.position);
}

function isOptional(value: unknown, isValue: (value: unknown) => boolean): boolean {
  return value === undefined || isValue(value);
}

function isListOf(value: unknown, isItem: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(isItem);
}

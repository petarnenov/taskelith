import type { HttpSchemas } from '@taskelith/contracts';
import {
  parseSessionGeneration,
  type Answer,
  type NativeRequest,
  type OutputEntry,
  type PrincipalId,
  type RequestKey,
  type Responder,
  type ResponseCommand,
  type SessionScope,
  type SessionView,
  type Turn,
  type TurnAuthor,
} from '@taskelith/execution';
import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import { parseOwnershipGeneration } from '@taskelith/sdlc';

type Wire<Name extends keyof HttpSchemas> = HttpSchemas[Name];

// Control-plane wire contracts section 9: the module's session values in
// the shapes of control-plane.openapi.json, and a response body back.
export function agentSessionBody(session: SessionView, scope: SessionScope): Wire<'AgentSession'> {
  const active = session.attempts.find((attempt) => !attempt.ended);
  const running = session.generations.find((run) => !run.ended);
  const { earliestRetained, lastPosition } = session.outputWindow;
  return {
    sessionId: session.id, taskId: session.taskId, runId: scope.runId, harness: session.harness,
    ...(session.limit === undefined ? {} : { limit: session.limit.resetsAt === undefined ? {} : { resetsAt: session.limit.resetsAt } }),
    ...(active === undefined ? {} : { activeAttempt: { attemptId: active.id, ownershipGeneration: active.ownershipGeneration } }),
    ...(running === undefined ? {} : { runningGeneration: running.generation }),
    lastTurnPosition: session.turns.length,
    lastRequestPosition: session.requests.length,
    output: { lastPosition, ...(earliestRetained === undefined ? {} : { earliestRetained }) },
    ...(session.handoff === undefined ? {} : { handoff: handoffBody(session.handoff) }),
  };
}

function handoffBody(handoff: NonNullable<SessionView['handoff']>): Wire<'AgentSessionHandoff'> {
  const { resetsAt, lastTurnWithOutcome, unresolvedRequests, evidence, takenBy } = handoff;
  return {
    ...(resetsAt === undefined ? {} : { resetsAt }),
    ...(lastTurnWithOutcome === undefined ? {} : { lastTurnWithOutcome }),
    unresolvedRequests: unresolvedRequests.map(requestKeyBody),
    evidence,
    ...(takenBy === undefined ? {} : { takenBy }),
  };
}

// A refused turn keeps the generation it was sent for (wire section 9).
export function turnBody(turn: Turn): Wire<'Turn'> {
  const identity = { turnId: turn.id, position: turn.position, author: authorBody(turn.author), text: turn.text };
  switch (turn.state) {
    case 'queued':
      return { ...identity, state: turn.state };
    case 'delivered':
    case 'outcome-unknown':
    case 'refused':
      return { ...identity, state: turn.state, generation: turn.generation };
    case 'ended':
      return {
        ...identity, state: turn.state, generation: turn.generation, outcome: turn.outcome,
        ...(turn.failure === undefined ? {} : { failure: turn.failure }),
      } as Wire<'Turn'>;
  }
}

function authorBody(author: TurnAuthor): Wire<'TurnAuthor'> {
  return author.kind === 'principal'
    ? { kind: 'principal', principalId: author.principalId }
    : { kind: 'host', delegationRequest: requestKeyBody(author.delegationRequest) };
}

// `position` is the request's place in recording order, from 1.
export function nativeRequestBody(request: NativeRequest, position: number): Wire<'NativeRequest'> {
  const recorded = { key: requestKeyBody(request.key), position, kind: request.kind, turnId: request.turnId, text: request.text };
  if (request.state !== 'answered') return { ...recorded, state: request.state };
  const { answer, responder, attemptId, ownershipGeneration, delivery } = request.response;
  return {
    ...recorded, state: 'answered', answer: answerBody(answer), responder: responderBody(responder), attemptId, ownershipGeneration, delivery,
  };
}

function requestKeyBody(key: RequestKey): Wire<'NativeRequestKey'> {
  return { generation: key.generation, nativeRequestId: key.nativeRequestId };
}

function answerBody(answer: Answer): Wire<'NativeAnswer'> {
  switch (answer.kind) {
    case 'permission':
      return { kind: 'permission', decision: answer.decision, ...(answer.message === undefined ? {} : { message: answer.message }) };
    case 'input':
      return { kind: 'input', text: answer.text };
    case 'delegation-result':
      return { kind: 'delegation-result', delegationId: answer.delegationId, outcome: answer.outcome, summary: answer.summary };
  }
}

function responderBody(responder: Responder): Wire<'Responder'> {
  switch (responder.kind) {
    case 'principal':
      return { kind: 'principal', principalId: responder.principalId };
    case 'standing-rule':
      return { kind: 'standing-rule', ruleId: responder.ruleId };
    case 'host':
      return { kind: 'host' };
  }
}

// A validated `NativeResponseSubmission` as the response of the person.
export function responseCommandOf(body: Wire<'NativeResponseSubmission'>, responder: PrincipalId): Result<ResponseCommand> {
  const key = parseIdentifier('IdempotencyKey', body.idempotencyKey);
  if (!key.ok) return key;
  const request = requestKeyOf(body.request);
  if (!request.ok) return request;
  const attemptId = parseIdentifier('AttemptId', body.attemptId);
  if (!attemptId.ok) return attemptId;
  const ownershipGeneration = parseOwnershipGeneration(body.ownershipGeneration);
  if (!ownershipGeneration.ok) return ownershipGeneration;
  const { answer } = body;
  return ok({
    key: key.value,
    response: {
      request: request.value,
      answer: answer.kind === 'input'
        ? { kind: 'input', text: answer.text }
        : { kind: 'permission', decision: answer.decision, ...(answer.message === undefined ? {} : { message: answer.message }) },
      responder: { kind: 'principal', principalId: responder },
      attemptId: attemptId.value,
      ownershipGeneration: ownershipGeneration.value,
    },
  });
}

function requestKeyOf(key: Wire<'NativeRequestKey'>): Result<RequestKey> {
  const generation = parseSessionGeneration(key.generation);
  if (!generation.ok) return generation;
  const nativeRequestId = parseIdentifier('NativeRequestId', key.nativeRequestId);
  return nativeRequestId.ok ? ok({ generation: generation.value, nativeRequestId: nativeRequestId.value }) : nativeRequestId;
}

export function outputEntryBody(entry: OutputEntry): Wire<'OutputEntry'> {
  return { position: entry.position, turnId: entry.turnId, generation: entry.generation, text: entry.text };
}

// `0` before the first entry, or the position of the last one held.
export function parseTimelineCursor(text: string | null): Result<number> {
  if (text === null) return ok(0);
  const cursor = /^(0|[1-9][0-9]{0,15})$/.test(text) ? Number(text) : Number.NaN;
  if (!Number.isSafeInteger(cursor)) return err(failure('invalid', 'after must be a timeline position, 0 or a positive safe integer'));
  return ok(cursor);
}

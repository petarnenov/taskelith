import type { JsonObject, OwnershipGeneration } from '@taskelith/sdlc';
import type { AttemptId, SessionGeneration, SessionId, TurnId } from './identifiers.js';
import {
  activeBoundAttempt,
  isSameRequestKey,
  replaced,
  runningGeneration,
  withChanges,
  type Answer,
  type NativeRequest,
  type RequestKey,
  type Responder,
  type Session,
  type TurnAuthor,
  type Turn,
} from './session-records.js';
import { nextDeliverableTurn } from './session-turns.js';

// Derives an ID's digest; equal input digests alike, so a command's identity
// does not depend on when or how often it is written.
export type CommandIdDigest = (identifier: string) => string;

export type SessionCommandType = 'session.turn.deliver' | 'session.response.deliver';

// A session command, its payload without the protocol version that the
// adapter adds for the assignment's worker (worker messages, section 3).
export interface SessionCommand {
  readonly commandId: string;
  readonly commandType: SessionCommandType;
  readonly sessionId: SessionId;
  readonly attemptId: AttemptId;
  readonly ownershipGeneration: OwnershipGeneration;
  readonly payload: JsonObject;
}

export type DueCommand =
  | { readonly kind: 'response'; readonly key: RequestKey; readonly command: SessionCommand }
  | { readonly kind: 'turn'; readonly turnId: TurnId; readonly generation: SessionGeneration; readonly command: SessionCommand };

// The commands that a change of a session makes due: responses first, as
// their refusal must precede every write (session timeline, section 5.2).
export function dueCommands(before: Session, after: Session, digest: CommandIdDigest): readonly DueCommand[] {
  return Object.freeze([...dueResponses(before, after, digest), ...dueTurn(after, digest)]);
}

// The session that stores the command's ID, once its command was written.
export function withCommandId(session: Session, due: DueCommand): Session {
  return due.kind === 'turn' ? withTurnCommand(session, due) : withResponseCommand(session, due);
}

function dueResponses(before: Session, after: Session, digest: CommandIdDigest): readonly DueCommand[] {
  return after.requests.flatMap((request) => {
    const earlier = before.requests.find((candidate) => isSameRequestKey(candidate.key, request.key));
    return earlier?.state === 'open' ? responseDue(after, request, digest) : [];
  });
}

// A host's delegation result is written by item 38, never here.
function responseDue(session: Session, request: NativeRequest, digest: CommandIdDigest): readonly DueCommand[] {
  if (request.state !== 'answered') return [];
  const { answer, responder, attemptId, ownershipGeneration } = request.response;
  if (answer.kind === 'delegation-result' || responder.kind === 'host') return [];
  const payload = {
    sessionId: session.id,
    request: requestKeyBody(request.key),
    answer: answerBody(answer),
    responder: responderBody(responder),
  };
  const commandId = commandIdOf(digest, ['session.response.deliver', session.id, request.key.generation, request.key.nativeRequestId]);
  const command: SessionCommand = { commandId, commandType: 'session.response.deliver', sessionId: session.id, attemptId, ownershipGeneration, payload };
  return [{ kind: 'response', key: request.key, command }];
}

function dueTurn(session: Session, digest: CommandIdDigest): readonly DueCommand[] {
  const run = runningGeneration(session);
  const attempt = activeBoundAttempt(session);
  const turn = nextDeliverableTurn(session);
  if (run === undefined || attempt === undefined || turn === undefined || hasCommandFor(turn, run.generation)) return [];
  const { generation } = run;
  const payload = { sessionId: session.id, generation, turn: { turnId: turn.id, position: turn.position, author: authorBody(turn.author), text: turn.text } };
  const commandId = commandIdOf(digest, ['session.turn.deliver', session.id, turn.id, generation]);
  const command: SessionCommand = {
    commandId, commandType: 'session.turn.deliver', sessionId: session.id, attemptId: attempt.id, ownershipGeneration: attempt.ownershipGeneration, payload,
  };
  return [{ kind: 'turn', turnId: turn.id, generation, command }];
}

function hasCommandFor(turn: Turn, generation: SessionGeneration): boolean {
  return turn.deliveryCommands?.some((record) => record.generation === generation) ?? false;
}

function withTurnCommand(session: Session, due: Extract<DueCommand, { kind: 'turn' }>): Session {
  const index = session.turns.findIndex((turn) => turn.id === due.turnId);
  const turn = session.turns[index]!;
  const deliveryCommands = [...(turn.deliveryCommands ?? []), { generation: due.generation, commandId: due.command.commandId }];
  return withChanges(session, { turns: replaced(session.turns, index, { ...turn, deliveryCommands }) });
}

function withResponseCommand(session: Session, due: Extract<DueCommand, { kind: 'response' }>): Session {
  const index = session.requests.findIndex((request) => isSameRequestKey(request.key, due.key));
  const request = session.requests[index]!;
  if (request.state !== 'answered') return session;
  const answered: NativeRequest = { ...request, response: { ...request.response, commandId: due.command.commandId } };
  return withChanges(session, { requests: replaced(session.requests, index, answered) });
}

// A printable, bounded ID of the wire's `Identifier`: `c` and a hex digest.
function commandIdOf(digest: CommandIdDigest, identity: readonly unknown[]): string {
  return `c${digest(JSON.stringify(identity))}`;
}

function requestKeyBody(key: RequestKey): JsonObject {
  return { generation: key.generation, nativeRequestId: key.nativeRequestId };
}

function authorBody(author: TurnAuthor): JsonObject {
  return author.kind === 'principal'
    ? { kind: author.kind, principalId: author.principalId }
    : { kind: author.kind, delegationRequest: requestKeyBody(author.delegationRequest) };
}

function answerBody(answer: Exclude<Answer, { kind: 'delegation-result' }>): JsonObject {
  if (answer.kind === 'input') return { kind: answer.kind, text: answer.text };
  return { kind: answer.kind, decision: answer.decision, ...(answer.message === undefined ? {} : { message: answer.message }) };
}

function responderBody(responder: Exclude<Responder, { kind: 'host' }>): JsonObject {
  return responder.kind === 'principal'
    ? { kind: responder.kind, principalId: responder.principalId }
    : { kind: responder.kind, ruleId: responder.ruleId };
}

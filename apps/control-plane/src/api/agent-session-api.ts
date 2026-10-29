import type { HttpSchemas } from '@taskelith/contracts';
import type {
  NativeRequest,
  PrincipalId,
  SessionId,
  SessionScope,
  SessionScopes,
  SessionTimelineService,
  ViewPositions,
} from '@taskelith/execution';
import { err, failure, ok, parseIdentifier, type Failure, type Result } from '@taskelith/kernel';
import type { Clock } from '@taskelith/sdlc';
import { StatusAnswer, type ApiRequest } from './api-server.js';
import { agentSessionBody, nativeRequestBody, parseTimelineCursor, responseCommandOf, turnBody } from './agent-session-wire.js';

export const AGENT_SESSION_PAGE = 100;

// What the agent session operations reach (wire contracts, section 9).
export interface AgentSessionOperations {
  readonly timeline: Pick<SessionTimelineService, 'readSession' | 'readCardSessions' | 'submitTurn' | 'consumeResponse'>;
  readonly scopes: SessionScopes;
  readonly positions: ViewPositions;
  readonly clock: Clock;
}

type Wire<Name extends keyof HttpSchemas> = HttpSchemas[Name];

interface Stamp {
  readonly asOf: string;
  readonly position: string;
}

// The handlers of section 9. The server checked the role on the path's
// project; each handler checks that the session or card belongs to it.
export class AgentSessionApi {
  readonly #operations: AgentSessionOperations;

  constructor(operations: AgentSessionOperations) {
    this.#operations = operations;
  }

  async listAgentSessions(request: ApiRequest): Promise<Result<Wire<'AgentSessionPage'>>> {
    const [projectText = '', runText = ''] = request.parameters;
    const after = optionalSessionId(request.query.get('after'));
    if (!after.ok) return after;
    const scope = await this.#card(projectText, runText);
    if (!scope.ok) return scope;
    const stamp = await this.#stamp();
    if (!stamp.ok) return stamp;
    const page = await this.#operations.timeline.readCardSessions(scope.value, after.value, AGENT_SESSION_PAGE);
    if (!page.ok) return page;
    const { sessions, more } = page.value;
    const next = more ? { next: sessions.at(-1)!.id } : {};
    return ok({ ...stamp.value, sessions: sessions.map((session) => agentSessionBody(session, scope.value)), ...next });
  }

  async readAgentSession(request: ApiRequest): Promise<Result<Wire<'AgentSessionView'>>> {
    const read = await this.#scopedRead(request);
    if (!read.ok) return read;
    const { stamp, session, scope } = read.value;
    return ok({ ...stamp, session: agentSessionBody(session, scope) });
  }

  async listAgentSessionTurns(request: ApiRequest): Promise<Result<Wire<'TurnPage'>>> {
    const after = parseTimelineCursor(request.query.get('after'));
    if (!after.ok) return after;
    const read = await this.#scopedRead(request);
    if (!read.ok) return read;
    const { stamp, session } = read.value;
    const turns = session.turns.filter((turn) => turn.position > after.value);
    const page = turns.slice(0, AGENT_SESSION_PAGE);
    return ok({ ...stamp, turns: page.map(turnBody), ...nextPosition(turns.length, page.at(-1)?.position) });
  }

  async listAgentSessionRequests(request: ApiRequest): Promise<Result<Wire<'NativeRequestPage'>>> {
    const after = parseTimelineCursor(request.query.get('after'));
    if (!after.ok) return after;
    const read = await this.#scopedRead(request);
    if (!read.ok) return read;
    const { stamp, session } = read.value;
    const requests = session.requests.slice(after.value);
    const page = requests.slice(0, AGENT_SESSION_PAGE);
    const bodies = page.map((native, index) => nativeRequestBody(native, after.value + index + 1));
    return ok({ ...stamp, requests: bodies, ...nextPosition(requests.length, after.value + page.length) });
  }

  // The caller is the turn's author, and the control plane mints its ID.
  async submitTurn(request: ApiRequest): Promise<Result<StatusAnswer>> {
    const principalId = callerOf(request);
    if (!principalId.ok) return principalId;
    const body = request.body as Wire<'TurnSubmission'>;
    const key = parseIdentifier('IdempotencyKey', body.idempotencyKey);
    if (!key.ok) return key;
    const sessionId = await this.#scopedSession(request);
    if (!sessionId.ok) return sessionId;
    const author = { kind: 'principal' as const, principalId: principalId.value };
    const submitted = await this.#operations.timeline.submitTurn(sessionId.value, { key: key.value, author, text: body.text });
    if (!submitted.ok) return submitted;
    const { effect, turn } = submitted.value;
    return ok(new StatusAnswer(effect === 'recorded' ? 201 : 200, { effect, turn: turnBody(turn) }));
  }

  async respondToNativeRequest(request: ApiRequest): Promise<Result<Wire<'NativeRequest'>>> {
    const principalId = callerOf(request);
    if (!principalId.ok) return principalId;
    const command = responseCommandOf(request.body as Wire<'NativeResponseSubmission'>, principalId.value);
    if (!command.ok) return command;
    const sessionId = await this.#scopedSession(request);
    if (!sessionId.ok) return sessionId;
    const answered = await this.#operations.timeline.consumeResponse(sessionId.value, command.value);
    if (!answered.ok) return answered;
    // Requests are only appended, so a later read keeps the position.
    const session = await this.#operations.timeline.readSession(sessionId.value);
    if (!session.ok) return session;
    return ok(nativeRequestBody(answered.value, positionOf(session.value.requests, answered.value)));
  }

  async #card(projectText: string, runText: string): Promise<Result<SessionScope>> {
    const projectId = parseIdentifier('ProjectId', projectText);
    const runId = parseIdentifier('RunId', runText);
    if (!projectId.ok || !runId.ok) return err(unknownCard());
    const scope = { projectId: projectId.value, runId: runId.value };
    const card = await this.#operations.scopes.isCard(scope.projectId, scope.runId);
    if (!card.ok) return card;
    return card.value ? ok(scope) : err(unknownCard());
  }

  // A session of another project answers as an unknown one, so that a
  // member learns nothing of another project's sessions.
  async #scopedSession(request: ApiRequest): Promise<Result<SessionId>> {
    const scoped = await this.#scopeOfPath(request);
    return scoped.ok ? ok(scoped.value.sessionId) : scoped;
  }

  async #scopeOfPath(request: ApiRequest): Promise<Result<{ sessionId: SessionId; scope: SessionScope }>> {
    const [projectText = '', sessionText = ''] = request.parameters;
    const sessionId = parseIdentifier('SessionId', sessionText);
    if (!sessionId.ok) return err(unknownSession());
    const scope = await this.#operations.scopes.scopeOf(sessionId.value);
    if (!scope.ok) return scope;
    if (scope.value?.projectId !== projectText) return err(unknownSession());
    return ok({ sessionId: sessionId.value, scope: scope.value });
  }

  async #scopedRead(request: ApiRequest) {
    const scoped = await this.#scopeOfPath(request);
    if (!scoped.ok) return scoped;
    const stamp = await this.#stamp();
    if (!stamp.ok) return stamp;
    const session = await this.#operations.timeline.readSession(scoped.value.sessionId);
    if (!session.ok) return session.error.code === 'not-found' ? err(unknownSession()) : session;
    return ok({ stamp: stamp.value, session: session.value, scope: scoped.value.scope });
  }

  // Taken before the read, so the state shown is no older than `asOf`.
  async #stamp(): Promise<Result<Stamp>> {
    const asOf = this.#operations.clock.now();
    const position = await this.#operations.positions.current();
    return position.ok ? ok({ asOf, position: position.value }) : position;
  }
}

function callerOf(request: ApiRequest): Result<PrincipalId> {
  if (request.principalId === undefined) return err(failure('internal', 'an agent session command reached its handler without a principal'));
  return parseIdentifier('PrincipalId', request.principalId);
}

function optionalSessionId(text: string | null): Result<SessionId | undefined> {
  if (text === null) return ok(undefined);
  const parsed = parseIdentifier('SessionId', text);
  return parsed.ok ? parsed : err(failure('invalid', 'after must be an agent session identifier'));
}

function nextPosition(remaining: number, last: number | undefined): { next?: number } {
  return remaining > AGENT_SESSION_PAGE && last !== undefined ? { next: last } : {};
}

function positionOf(requests: readonly NativeRequest[], answered: NativeRequest): number {
  return requests.findIndex((candidate) => candidate.key.generation === answered.key.generation
    && candidate.key.nativeRequestId === answered.key.nativeRequestId) + 1;
}

// One body for an unknown session and a foreign one, naming neither.
function unknownSession(): Failure {
  return failure('not-found', 'no agent session of the project has this identifier');
}

function unknownCard(): Failure {
  return failure('not-found', 'no card of the project has this run');
}

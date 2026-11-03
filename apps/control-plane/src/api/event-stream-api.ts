import type { ServerResponse } from 'node:http';
import { OWNER_ONLY, projectRead, unauthenticated, type AccessRequirement, type PrincipalId, type SecretHash } from '@taskelith/access';
import { checkHttpSchema } from '@taskelith/contracts';
import { INSTALLATION_SCOPE, projectScope, type UiEventScope } from '@taskelith/execution';
import { err, failure, ok, parseIdentifier, type Instant, type Result } from '@taskelith/kernel';
import type { ProjectId } from '@taskelith/sdlc';
import type { Logger } from '@taskelith/observability';
import type { EventStreamHub, SinkAnswer, StreamFrame, StreamSink, StreamSubject } from '../application/event-stream-hub.js';
import type { ApiRequest } from './api-server.js';
import { eventData, frameText } from './event-stream-wire.js';
import { StreamAnswer } from './http-exchange.js';

// Provisional, in docs/operational-targets.md: the bytes a stream's
// response may hold unsent before the stream ends.
export const MAX_STREAM_BUFFER_BYTES = 1024 ** 2;
const EVENT_POSITION = /^(0|[1-9][0-9]{0,15})$/;

type EventSchema = 'ProjectEvent' | 'InstallationEvent';

// What the stream operations reach (wire contracts section 10).
export interface EventStreamOperations {
  readonly hub: Pick<EventStreamHub, 'open'>;
  readonly projects: { readProject(projectId: string): Promise<Result<unknown>> };
  readonly authorization: { authorize(principalId: PrincipalId, requirement: AccessRequirement): Promise<Result<void>> };
  readonly sessions: { liveUntil(idHash: SecretHash): Promise<Result<Instant | undefined>> };
  readonly logger: Logger;
}

// The handlers of the two streams. The server checked the role before;
// the hub checks it again after it read the log's bounds.
export class EventStreamApi {
  readonly #operations: EventStreamOperations;

  constructor(operations: EventStreamOperations) {
    this.#operations = operations;
  }

  async streamProjectEvents(request: ApiRequest): Promise<Result<StreamAnswer>> {
    const cursor = streamCursor(request);
    if (!cursor.ok) return cursor;
    const [projectId = ''] = request.parameters;
    const reauthorize = (principalId: PrincipalId) => this.#readableProject(principalId, projectId);
    return this.#open(request, projectScope(projectId as ProjectId), reauthorize, 'ProjectEvent', cursor.value);
  }

  async streamInstallationEvents(request: ApiRequest): Promise<Result<StreamAnswer>> {
    const cursor = streamCursor(request);
    if (!cursor.ok) return cursor;
    const reauthorize = (principalId: PrincipalId) => this.#operations.authorization.authorize(principalId, OWNER_ONLY);
    return this.#open(request, INSTALLATION_SCOPE, reauthorize, 'InstallationEvent', cursor.value);
  }

  // The role before the project, so that a denial is 403 and never 404.
  async #readableProject(principalId: PrincipalId, projectId: string): Promise<Result<void>> {
    const authorized = await this.#operations.authorization.authorize(principalId, projectRead(projectId));
    if (!authorized.ok) return authorized;
    const project = await this.#operations.projects.readProject(projectId);
    return project.ok ? ok(undefined) : project;
  }

  async #open(
    request: ApiRequest,
    scope: UiEventScope,
    reauthorize: (principalId: PrincipalId) => Promise<Result<void>>,
    schema: EventSchema,
    cursor: number | undefined,
  ): Promise<Result<StreamAnswer>> {
    const { principalId, session } = request;
    if (principalId === undefined) return err(unauthenticated());
    const reader = parseIdentifier('PrincipalId', principalId);
    if (!reader.ok) return reader;
    const { sessions, logger } = this.#operations;
    const subject: StreamSubject = {
      scope, principalId: reader.value, reauthorize: () => reauthorize(principalId),
      ...(session === undefined ? {} : { login: { liveUntil: () => sessions.liveUntil(session.session.idHash) } }),
    };
    const opened = await this.#operations.hub.open(subject, cursor);
    if (!opened.ok) return opened;
    // A client that went away during the open already closed its response.
    return ok(new StreamAnswer((response) => {
      if (isGone(response)) return;
      const detach = opened.value.attach(new ResponseSink(response, schema, logger));
      response.once('close', detach);
    }));
  }
}

function isGone(response: ServerResponse): boolean {
  return response.destroyed || response.writableEnded;
}

// `Last-Event-ID` wins over `after`, and either one malformed is invalid;
// a position past the safe integers is past any head.
function streamCursor(request: ApiRequest): Result<number | undefined> {
  const after = request.query.get('after') ?? undefined;
  for (const [name, text] of [['after', after], ['Last-Event-ID', request.lastEventId]] as const) {
    if (text !== undefined && !EVENT_POSITION.test(text)) return err(failure('invalid', `${name} must be an event position`));
  }
  const text = request.lastEventId ?? after;
  return ok(text === undefined ? undefined : Math.min(Number(text), Number.MAX_SAFE_INTEGER));
}

// Frames as `text/event-stream` text; an event that breaks its schema is a
// defect, logged and never sent.
class ResponseSink implements StreamSink {
  readonly #response: ServerResponse;
  readonly #schema: EventSchema;
  readonly #logger: Logger;

  constructor(response: ServerResponse, schema: EventSchema, logger: Logger) {
    this.#response = response;
    this.#schema = schema;
    this.#logger = logger;
  }

  send(frame: StreamFrame): SinkAnswer {
    if (isGone(this.#response)) return 'gone';
    const text = this.#text(frame);
    if (text !== undefined) this.#response.write(text);
    return this.#response.writableLength <= MAX_STREAM_BUFFER_BYTES ? 'sent' : 'full';
  }

  // A full buffer is dropped; otherwise the last frame is flushed first.
  close(): void {
    if (isGone(this.#response)) return;
    if (this.#response.writableLength > MAX_STREAM_BUFFER_BYTES) this.#response.destroy();
    else this.#response.end();
  }

  #text(frame: StreamFrame): string | undefined {
    if (frame.kind !== 'event') return frameText(frame);
    const data = eventData(frame.position, frame.event);
    const checked = checkHttpSchema(this.#schema, data);
    if (checked.ok) return frameText({ kind: 'event', data });
    this.#logger.error('events.stream.invalid-event', { type: data.type, violation: checked.error[0] ?? '' });
    return undefined;
  }
}

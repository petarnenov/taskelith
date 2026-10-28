import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import { performance } from 'node:perf_hooks';
import { csrfTokenMatches, unauthenticated, type AccessRequirement, type LiveSession, type PrincipalId } from '@taskelith/access';
import { checkHttpSchema, type HttpSchemas } from '@taskelith/contracts';
import type { WorkerPrincipal } from '@taskelith/fleet';
import { err, failure, ok, parseIdentifier, type CorrelationId, type Failure, type Result } from '@taskelith/kernel';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import { redactSecrets } from '@taskelith/secrets';
import {
  MAX_BODY_BYTES,
  MAX_CONCURRENT_UPLOADS,
  MAX_EVIDENCE_BYTES,
  bearerToken,
  failureResponse,
  parseJson,
  readBody,
  readJsonBody,
  writeResponse,
  type ApiResponse,
} from './http-exchange.js';
import { requirementBeforeBody } from './access-requirements.js';
import { multipartBoundary, parseMultipart } from './multipart.js';
import { requestLogFields } from './request-log.js';
import { MINIMUM_TLS_VERSION, type ServerTls } from './server-tls.js';
import { UploadSlots } from './upload-slots.js';
import { ROUTES, type RouteDefinition } from './routes.js';
import { sessionCookie } from './session-cookie.js';

// Who a request's credential authenticated: the worker of a worker bearer,
// or the principal of the operator bearer or of an authenticated session.
export interface Caller {
  readonly worker?: WorkerPrincipal;
  readonly principalId?: PrincipalId;
  readonly session?: LiveSession;
}

// A validated request: path parameters, body, query, correlation, the
// caller, and the source address that login throttling keys on.
export interface ApiRequest extends Caller {
  readonly parameters: readonly string[];
  readonly body: unknown;
  readonly query: URLSearchParams;
  readonly correlationId: CorrelationId;
  readonly sourceAddress?: string;
}

// The validated body of an `upload` route.
export interface Upload {
  readonly record: unknown;
  readonly content: Uint8Array;
}

// A success whose status or headers the operation decides, such as 200 for
// a repeat of a publication that its route answers with 201.
export class StatusAnswer {
  constructor(readonly status: number, readonly body: unknown, readonly headers: Readonly<Record<string, string>> = {}) {}
}

// What the operations do; each answers with the success value or a failure.
export interface ApiHandlers {
  authenticateOperator(secret: string): Promise<Result<PrincipalId>>;
  authenticateWorker(secret: string): Promise<Result<WorkerPrincipal>>;
  authenticateSession(sessionId: string): Promise<Result<LiveSession>>;
  authorize(principalId: PrincipalId, requirement: AccessRequirement): Promise<Result<void>>;
  // The role on the project of the path's resource, ok for other operations.
  authorizeResource(operationId: string, caller: Caller, parameters: readonly string[]): Promise<Result<void>>;
  handle(operationId: string, request: ApiRequest, bearer: string): Promise<Result<unknown>>;
}

export interface ApiServerOptions {
  readonly logger?: Logger;
  // The operations served; the contract's route table unless replaced.
  readonly routes?: readonly RouteDefinition[];
  readonly maxConcurrentUploads?: number;
  // Plain HTTP without it, which only unit tests of the handling use.
  readonly tls?: ServerTls;
}

export type ApiServer = Server | HttpsServer;
export type ApiRequestListener = (request: IncomingMessage, response: ServerResponse) => void;

// The control-plane API over node:http, or node:https with `tls`.
export function createApiServer(handlers: ApiHandlers, options: ApiServerOptions = {}): ApiServer {
  const listener = createApiRequestListener(handlers, options);
  return options.tls === undefined ? createServer(listener) : createTlsApiServer(listener, options.tls);
}

// An HTTPS listener of the API that refuses TLS below 1.2.
export function createTlsApiServer(listener: ApiRequestListener, tls: ServerTls): HttpsServer {
  return createHttpsServer({ cert: tls.certificate, key: tls.key, minVersion: MINIMUM_TLS_VERSION }, listener);
}

// Request handling that listeners may share: checkHttpSchema validates, and
// no log line holds a request body, cookie, or bearer.
export function createApiRequestListener(handlers: ApiHandlers, options: ApiServerOptions = {}): ApiRequestListener {
  const logger = options.logger ?? SILENT_LOGGER;
  const routes = options.routes ?? ROUTES;
  const uploads = new UploadSlots(options.maxConcurrentUploads ?? MAX_CONCURRENT_UPLOADS);
  return (request, response) => {
    // A reused idle socket races the idle timeout: a request written as it
    // fires is reset unread, so every answer closes its connection.
    response.shouldKeepAlive = false;
    // serve answers every failure itself; this only guards a broken socket.
    serve(handlers, uploads, routes, logger, request, response).catch(() => response.destroy());
  };
}

async function serve(
  handlers: ApiHandlers,
  uploads: UploadSlots,
  routes: readonly RouteDefinition[],
  logger: Logger,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const startedAt = performance.now();
  const correlationId = correlationOf(request);
  let operationId = 'unknown';
  let parameters: readonly string[] = [];
  let query = new URLSearchParams();
  let declaredQuery: readonly string[] = [];
  let answer: ApiResponse;
  try {
    const url = new URL(request.url ?? '/', 'http://control-plane');
    query = url.searchParams;
    const matched = match(routes, request.method ?? 'GET', url.pathname);
    if (matched === undefined) {
      answer = failureResponse(404, failure('not-found', 'no operation has this method and path'));
    } else if (!matched.ok) {
      answer = failureResponse(400, matched.error);
    } else {
      ({ parameters } = matched.value);
      operationId = matched.value.route.operationId;
      declaredQuery = matched.value.route.query ?? [];
      answer = await answerRoute(handlers, uploads, matched.value, request, url, correlationId);
    }
  } catch (error) {
    answer = failureResponse(500, failure('internal', error instanceof Error ? error.message : String(error)));
  }
  if (!response.headersSent) writeResponse(response, answer, correlationId);
  const fields = requestLogFields({
    method: redactSecrets(request.method ?? ''), operationId, parameters, query, declaredQuery, status: answer.status,
    durationMs: Math.round(performance.now() - startedAt), ...(answer.failure === undefined ? {} : { failure: answer.failure }),
  });
  const log = logger.with({ correlationId });
  if (answer.status >= 500) log.error('api.request', fields);
  else log.info('api.request', fields);
}

// Wire contracts section 2: authenticate, then the CSRF header of a
// session-authenticated mutation, then the role, and only then the body.
async function answerRoute(
  handlers: ApiHandlers,
  uploads: UploadSlots,
  { route, parameters }: { route: RouteDefinition; parameters: readonly string[] },
  request: IncomingMessage,
  url: URL,
  correlationId: CorrelationId,
): Promise<ApiResponse> {
  const bearer = bearerToken(request) ?? '';
  const caller = await authenticate(handlers, route, request);
  if (!caller.ok) return refusal(caller.error);
  const { session } = caller.value;
  if (session !== undefined && request.method !== 'GET' && !csrfTokenMatches(session.session.csrfToken, csrfHeader(request))) {
    return failureResponse(403, failure('forbidden', 'the request has no valid CSRF token for its session', { reason: 'csrf-token-invalid' }));
  }
  const requirement = requirementBeforeBody(route.operationId, parameters);
  if (requirement !== undefined) {
    const authorized = await authorizeCaller(handlers, caller.value, requirement);
    if (authorized !== undefined) return authorized;
  }
  const resource = await handlers.authorizeResource(route.operationId, caller.value, parameters);
  if (!resource.ok) return failureResponse(statusOf(route, resource.error), resource.error);
  const handled = async (): Promise<ApiResponse> => {
    const body = await validatedBody(request, route);
    if (!body.ok) return failureResponse(400, body.error);
    const sourceAddress = request.socket.remoteAddress ?? 'unknown';
    const validated = { parameters, body: body.value, query: url.searchParams, correlationId, sourceAddress, ...caller.value };
    const outcome = await handlers.handle(route.operationId, validated, bearer);
    if (!outcome.ok) return failureResponse(statusOf(route, outcome.error), outcome.error);
    return successResponse(route, outcome.value);
  };
  return route.upload ? uploads.run(handled) : handled();
}

// The role check: 401 without a principal, 403 for a denial, and 503 when
// the roles cannot be read; undefined when the caller passes.
async function authorizeCaller(handlers: ApiHandlers, caller: Caller, requirement: AccessRequirement): Promise<ApiResponse | undefined> {
  if (caller.principalId === undefined) return failureResponse(401, unauthenticated());
  const authorized = await handlers.authorize(caller.principalId, requirement);
  if (authorized.ok) return undefined;
  if (authorized.error.code === 'forbidden') return failureResponse(403, authorized.error);
  return failureResponse(503, failure('unavailable', 'the roles cannot be read'));
}

function csrfHeader(request: IncomingMessage): string | undefined {
  const header = request.headers['x-csrf-token'];
  return typeof header === 'string' ? header : undefined;
}

function statusOf(route: RouteDefinition, failed: Failure): number {
  const reason = failed.details.reason;
  return (reason === undefined ? undefined : route.reasons?.[reason]) ?? route.statuses[failed.code] ?? 500;
}

// A success that breaks its own schema is a defect, never sent as is.
function successResponse(route: RouteDefinition, answer: unknown): ApiResponse {
  const [status, value, headers] = answer instanceof StatusAnswer ? [answer.status, answer.body, answer.headers] : [route.success, answer, {}];
  if (route.response === 'empty') return { status, empty: true, headers };
  if (route.response === 'binary') {
    if (value instanceof Uint8Array) return { status, binary: value };
    return failureResponse(500, failure('internal', `the ${route.operationId} response is not bytes`));
  }
  const checked = checkHttpSchema(route.response, value);
  if (checked.ok) return { status, body: value, headers };
  return failureResponse(500, failure('internal', `the ${route.operationId} response violates ${route.response}`, { violation: checked.error[0] ?? '' }));
}

// Whatever a route declares: a refused credential is 401, and any other
// failure a constant 503, so no unauthenticated caller sees a store's detail.
function refusal(error: Failure): ApiResponse {
  if (error.code === 'forbidden') return failureResponse(401, error);
  return failureResponse(503, failure('unavailable', 'the credential store is not available'));
}

// The first alternative the request's credential satisfies. A bearer wins
// over a cookie (Q11); an operation that accepts no bearer refuses one.
async function authenticate(handlers: ApiHandlers, route: RouteDefinition, request: IncomingMessage): Promise<Result<Caller>> {
  const accepts = new Set(route.security);
  const bearer = bearerToken(request);
  if (accepts.has('workerCredential')) {
    if (bearer === undefined) return err(unauthenticated());
    const worker = await handlers.authenticateWorker(bearer);
    return worker.ok ? ok({ worker: worker.value }) : worker;
  }
  if (accepts.has('enrollmentToken')) return bearer === undefined ? err(unauthenticated()) : ok({});
  if (accepts.has('operatorToken') && bearer !== undefined) {
    const principalId = await handlers.authenticateOperator(bearer);
    if (principalId.ok) return ok({ principalId: principalId.value });
    return principalId.error.code === 'forbidden' ? err(unauthenticated()) : principalId;
  }
  if (accepts.has('browserSession')) return authenticateSession(handlers, accepts.has('none'), request);
  return accepts.has('none') ? ok({}) : err(unauthenticated());
}

// An optional session, `readSession`'s, ignores what does not authenticate:
// that operation then starts a new anonymous session.
async function authenticateSession(handlers: ApiHandlers, optional: boolean, request: IncomingMessage): Promise<Result<Caller>> {
  if (!optional && request.headers.authorization !== undefined) return err(unauthenticated());
  const sessionId = sessionCookie(request.headers.cookie);
  if (sessionId === undefined) return optional ? ok({}) : err(unauthenticated());
  const live = await handlers.authenticateSession(sessionId);
  if (live.ok) return ok({ session: live.value, ...(live.value.principal === undefined ? {} : { principalId: live.value.principal.principalId }) });
  if (live.error.code !== 'forbidden') return live;
  return optional ? ok({}) : err(unauthenticated());
}

async function validatedBody(request: IncomingMessage, route: RouteDefinition): Promise<Result<unknown>> {
  if (route.body === undefined) return ok(undefined);
  if (route.upload) return validatedUpload(request, route.body);
  const body = await readJsonBody(request);
  if (!body.ok) return body;
  const checked = checkedBody(route.body, body.value);
  return checked.ok || !route.writeOnlyBody ? checked : err(writeOnlyViolation(route.body, checked.error));
}

// Names only the fields at fault: a validator message may quote a value or
// a property name that the caller sent beside a password.
function writeOnlyViolation(schema: string, violation: Failure): Failure {
  const paths = [...new Set(violation.message.split('; ').map((line) => /^\S+ (\/\S*) /.exec(line)?.[1] ?? '/'))];
  const rules = paths.flatMap((path) => FIELD_RULES[path] ?? []);
  const message = [`the ${schema} body is not valid at ${paths.join(', ')}`, ...rules].join('; ');
  return failure('invalid', message, { violations: violation.details.violations ?? '1' });
}

// Fixed texts of a field's rule, so a caller learns it without its value.
const FIELD_RULES: Readonly<Record<string, string>> = Object.freeze({
  '/loginName': 'the login name must be lowercase: 1-64 letters, digits, ".", "_", or "-", starting with a letter or digit',
});

// Exactly a JSON `record` part, at most 1 MiB, and a `content` part.
async function validatedUpload(request: IncomingMessage, schema: keyof HttpSchemas & string): Promise<Result<Upload>> {
  const boundary = multipartBoundary(request.headers['content-type']);
  if (!boundary.ok) return boundary;
  const body = await readBody(request, MAX_EVIDENCE_BYTES + MAX_BODY_BYTES);
  if (!body.ok) return body;
  const parts = parseMultipart(boundary.value, body.value);
  if (!parts.ok) return parts;
  const record = parts.value.find((part) => part.name === 'record');
  const content = parts.value.find((part) => part.name === 'content');
  if (parts.value.length !== 2 || record === undefined || content === undefined) {
    return err(failure('invalid', 'the body must have exactly one record part and one content part'));
  }
  if (record.content.length > MAX_BODY_BYTES) return err(failure('invalid', `the record part exceeds ${MAX_BODY_BYTES} bytes`));
  if (content.content.length > MAX_EVIDENCE_BYTES) return err(failure('invalid', `the content exceeds ${MAX_EVIDENCE_BYTES} bytes`));
  const parsed = parseJson(record.content);
  if (!parsed.ok) return parsed;
  const checked = checkedBody(schema, parsed.value);
  return checked.ok ? ok({ record: checked.value, content: content.content }) : checked;
}

function checkedBody(schema: keyof HttpSchemas & string, value: unknown): Result<unknown> {
  const checked = checkHttpSchema(schema, value);
  if (checked.ok) return checked;
  return err(failure('invalid', checked.error.slice(0, 3).join('; '), { violations: String(checked.error.length) }));
}

function match(
  routes: readonly RouteDefinition[],
  method: string,
  path: string,
): Result<{ route: RouteDefinition; parameters: readonly string[] }> | undefined {
  for (const route of routes) {
    const found = route.method === method ? route.pattern.exec(path) : null;
    if (found === null) continue;
    try {
      return ok({ route, parameters: found.slice(1).map((part) => decodeURIComponent(part)) });
    } catch {
      return err(failure('invalid', 'a path parameter is not valid percent-encoding'));
    }
  }
  return undefined;
}

// A caller's correlation when it is a valid identifier, else a new one.
function correlationOf(request: IncomingMessage): CorrelationId {
  const header = request.headers['x-correlation-id'];
  // A value that carries a secret would put it into every log line.
  const safe = typeof header === 'string' && redactSecrets(header) === header;
  const given = safe ? parseIdentifier('CorrelationId', header) : undefined;
  if (given?.ok) return given.value as CorrelationId;
  // A prefixed UUID is always a valid identifier.
  return `c-${randomUUID()}` as CorrelationId;
}

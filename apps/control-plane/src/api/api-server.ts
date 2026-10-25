import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { performance } from 'node:perf_hooks';
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
import { parseMultipart } from './multipart.js';
import { UploadSlots } from './upload-slots.js';
import { ROUTES, type RouteDefinition, type SecurityScheme } from './routes.js';

// A validated request: path parameters, body, query, and correlation, and
// for a `workerCredential` route the worker its bearer authenticated.
export interface ApiRequest {
  readonly parameters: readonly string[];
  readonly body: unknown;
  readonly query: URLSearchParams;
  readonly correlationId: CorrelationId;
  readonly worker?: WorkerPrincipal;
}

// The validated body of an `upload` route.
export interface Upload {
  readonly record: unknown;
  readonly content: Uint8Array;
}

// A success whose status the operation decides, such as 200 for a repeat
// of a publication that its route answers with 201.
export class StatusAnswer {
  constructor(readonly status: number, readonly body: unknown) {}
}

// What the operations do; each answers with the success value or a failure.
export interface ApiHandlers {
  authenticateOperator(secret: string): Promise<Result<void>>;
  authenticateWorker(secret: string): Promise<Result<WorkerPrincipal>>;
  handle(operationId: string, request: ApiRequest, bearer: string): Promise<Result<unknown>>;
}

export interface ApiServerOptions {
  readonly logger?: Logger;
  // The operations served; the contract's route table unless replaced.
  readonly routes?: readonly RouteDefinition[];
  readonly maxConcurrentUploads?: number;
}

// The control-plane API over node:http: no framework, contract validation
// with checkHttpSchema, and no request body or bearer in any log line.
export function createApiServer(handlers: ApiHandlers, options: ApiServerOptions = {}): Server {
  const logger = options.logger ?? SILENT_LOGGER;
  const routes = options.routes ?? ROUTES;
  const uploads = new UploadSlots(options.maxConcurrentUploads ?? MAX_CONCURRENT_UPLOADS);
  return createServer((request, response) => {
    // serve answers every failure itself; this only guards a broken socket.
    serve(handlers, uploads, routes, logger, request, response).catch(() => response.destroy());
  });
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
  let answer: ApiResponse;
  try {
    const url = new URL(request.url ?? '/', 'http://control-plane');
    const matched = match(routes, request.method ?? 'GET', url.pathname);
    if (matched === undefined) {
      answer = failureResponse(404, failure('not-found', 'no operation has this method and path'));
    } else if (!matched.ok) {
      answer = failureResponse(400, matched.error);
    } else {
      operationId = matched.value.route.operationId;
      answer = await answerRoute(handlers, uploads, matched.value, request, url, correlationId);
    }
  } catch (error) {
    answer = failureResponse(500, failure('internal', error instanceof Error ? error.message : String(error)));
  }
  if (!response.headersSent) writeResponse(response, answer, correlationId);
  const fields = { operationId, status: answer.status, durationMs: Math.round(performance.now() - startedAt) };
  const log = logger.with({ correlationId });
  if (answer.status >= 500) log.error('api.request', fields);
  else log.info('api.request', fields);
}

async function answerRoute(
  handlers: ApiHandlers,
  uploads: UploadSlots,
  { route, parameters }: { route: RouteDefinition; parameters: readonly string[] },
  request: IncomingMessage,
  url: URL,
  correlationId: CorrelationId,
): Promise<ApiResponse> {
  const bearer = bearerToken(request);
  if (bearer === undefined) return failureResponse(401, failure('forbidden', 'the request has no bearer credential'));
  const principal = await authenticated(handlers, route.security, bearer);
  if (!principal.ok) return refusal(principal.error);
  const handled = async (): Promise<ApiResponse> => {
    const body = await validatedBody(request, route);
    if (!body.ok) return failureResponse(400, body.error);
    const validated = { parameters, body: body.value, query: url.searchParams, correlationId, ...principal.value };
    const outcome = await handlers.handle(route.operationId, validated, bearer);
    if (!outcome.ok) return failureResponse(statusOf(route, outcome.error), outcome.error);
    return successResponse(route, outcome.value);
  };
  return route.upload ? uploads.run(handled) : handled();
}

function statusOf(route: RouteDefinition, failed: Failure): number {
  const reason = failed.details.reason;
  return (reason === undefined ? undefined : route.reasons?.[reason]) ?? route.statuses[failed.code] ?? 500;
}

// A success that breaks its own schema is a defect, never sent as is.
function successResponse(route: RouteDefinition, answer: unknown): ApiResponse {
  const [status, value] = answer instanceof StatusAnswer ? [answer.status, answer.body] : [route.success, answer];
  if (route.response === 'binary') {
    if (value instanceof Uint8Array) return { status, binary: value };
    return failureResponse(500, failure('internal', `the ${route.operationId} response is not bytes`));
  }
  const checked = checkHttpSchema(route.response, value);
  if (checked.ok) return { status, body: value };
  return failureResponse(500, failure('internal', `the ${route.operationId} response violates ${route.response}`, { violation: checked.error[0] ?? '' }));
}

// Whatever a route declares: a refused credential is 401, and any other
// failure a constant 503, so no unauthenticated caller sees a store's detail.
function refusal(error: Failure): ApiResponse {
  if (error.code === 'forbidden') return failureResponse(401, error);
  return failureResponse(503, failure('unavailable', 'the credential store is not available'));
}

// The enrollment token is checked by its operation, which consumes it.
async function authenticated(
  handlers: ApiHandlers,
  scheme: SecurityScheme,
  bearer: string,
): Promise<Result<{ worker?: WorkerPrincipal }>> {
  if (scheme === 'enrollmentToken') return ok({});
  if (scheme === 'operatorToken') {
    const operator = await handlers.authenticateOperator(bearer);
    return operator.ok ? ok({}) : operator;
  }
  const worker = await handlers.authenticateWorker(bearer);
  return worker.ok ? ok({ worker: worker.value }) : worker;
}

async function validatedBody(request: IncomingMessage, route: RouteDefinition): Promise<Result<unknown>> {
  if (route.body === undefined) return ok(undefined);
  if (route.upload) return validatedUpload(request, route.body);
  const body = await readJsonBody(request);
  return body.ok ? checkedBody(route.body, body.value) : body;
}

// Exactly a JSON `record` part, at most 1 MiB, and a `content` part.
async function validatedUpload(request: IncomingMessage, schema: keyof HttpSchemas & string): Promise<Result<Upload>> {
  const body = await readBody(request, MAX_EVIDENCE_BYTES + MAX_BODY_BYTES);
  if (!body.ok) return body;
  const parts = parseMultipart(request.headers['content-type'], body.value);
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

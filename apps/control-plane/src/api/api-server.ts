import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { performance } from 'node:perf_hooks';
import { checkHttpSchema, type HttpSchemas } from '@taskelith/contracts';
import { err, failure, parseIdentifier, type CorrelationId, type Result } from '@taskelith/kernel';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import { bearerToken, failureResponse, readJsonBody, writeJson, type JsonResponse } from './http-exchange.js';
import { ROUTES, type RouteDefinition } from './routes.js';

// A validated request: the route's path parameters, its body when it has
// one, the query, and its correlation; the bearer stays with the server.
export interface ApiRequest {
  readonly parameters: readonly string[];
  readonly body: unknown;
  readonly query: URLSearchParams;
  readonly correlationId: CorrelationId;
}

// What the operations do; each answers with the success value or a failure.
export interface ApiHandlers {
  authenticateOperator(secret: string): Promise<Result<void>>;
  handle(operationId: string, request: ApiRequest, bearer: string): Promise<Result<unknown>>;
}

export interface ApiServerOptions {
  readonly logger?: Logger;
}

// The control-plane API over node:http: no framework, contract validation
// with checkHttpSchema, and no request body or bearer in any log line.
export function createApiServer(handlers: ApiHandlers, options: ApiServerOptions = {}): Server {
  const logger = options.logger ?? SILENT_LOGGER;
  return createServer((request, response) => {
    void serve(handlers, logger, request, response);
  });
}

async function serve(handlers: ApiHandlers, logger: Logger, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const startedAt = performance.now();
  const correlationId = correlationOf(request);
  const url = new URL(request.url ?? '/', 'http://control-plane');
  const matched = match(request.method ?? 'GET', url.pathname);
  const operationId = matched?.route.operationId ?? 'unknown';
  let answer: JsonResponse;
  try {
    answer = matched === undefined
      ? failureResponse(404, failure('not-found', `no operation ${request.method} ${url.pathname}`))
      : await answerRoute(handlers, matched, request, url, correlationId);
  } catch (error) {
    answer = failureResponse(500, failure('internal', error instanceof Error ? error.message : String(error)));
  }
  writeJson(response, answer, correlationId);
  const fields = { operationId, status: answer.status, durationMs: Math.round(performance.now() - startedAt) };
  const log = logger.with({ correlationId });
  if (answer.status >= 500) log.error('api.request', fields);
  else log.info('api.request', fields);
}

async function answerRoute(
  handlers: ApiHandlers,
  { route, parameters }: { route: RouteDefinition; parameters: readonly string[] },
  request: IncomingMessage,
  url: URL,
  correlationId: CorrelationId,
): Promise<JsonResponse> {
  const bearer = bearerToken(request);
  if (bearer === undefined) return failureResponse(401, failure('forbidden', 'the request has no bearer credential'));
  if (route.security === 'operatorToken') {
    const authenticated = await handlers.authenticateOperator(bearer);
    if (!authenticated.ok) return failureResponse(401, authenticated.error);
  }
  const body = route.body === undefined ? { ok: true as const, value: undefined } : await validatedBody(request, route.body);
  if (!body.ok) return failureResponse(400, body.error);
  const outcome = await handlers.handle(route.operationId, { parameters, body: body.value, query: url.searchParams, correlationId }, bearer);
  if (outcome.ok) return { status: route.success, body: outcome.value };
  return failureResponse(route.statuses[outcome.error.code] ?? 500, outcome.error);
}

async function validatedBody(request: IncomingMessage, schema: keyof HttpSchemas & string): Promise<Result<unknown>> {
  const body = await readJsonBody(request);
  if (!body.ok) return body;
  const checked = checkHttpSchema(schema, body.value);
  if (checked.ok) return checked;
  return err(failure('invalid', checked.error.slice(0, 3).join('; '), { violations: String(checked.error.length) }));
}

function match(method: string, path: string): { route: RouteDefinition; parameters: readonly string[] } | undefined {
  for (const route of ROUTES) {
    const found = route.method === method ? route.pattern.exec(path) : null;
    if (found !== null) return { route, parameters: found.slice(1).map((part) => decodeURIComponent(part)) };
  }
  return undefined;
}

// A caller's correlation when it is a valid identifier, else a new one.
function correlationOf(request: IncomingMessage): CorrelationId {
  const header = request.headers['x-correlation-id'];
  const given = typeof header === 'string' ? parseIdentifier('CorrelationId', header) : undefined;
  if (given?.ok) return given.value as CorrelationId;
  // A prefixed UUID is always a valid identifier.
  return `c-${randomUUID()}` as CorrelationId;
}

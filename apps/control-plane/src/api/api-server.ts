import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { performance } from 'node:perf_hooks';
import { checkHttpSchema, type HttpSchemas } from '@taskelith/contracts';
import type { WorkerPrincipal } from '@taskelith/fleet';
import { err, failure, ok, parseIdentifier, type CorrelationId, type Result } from '@taskelith/kernel';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import { redactSecrets } from '@taskelith/secrets';
import { bearerToken, failureResponse, readJsonBody, writeJson, type JsonResponse } from './http-exchange.js';
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
}

// The control-plane API over node:http: no framework, contract validation
// with checkHttpSchema, and no request body or bearer in any log line.
export function createApiServer(handlers: ApiHandlers, options: ApiServerOptions = {}): Server {
  const logger = options.logger ?? SILENT_LOGGER;
  const routes = options.routes ?? ROUTES;
  return createServer((request, response) => {
    // serve answers every failure itself; this only guards a broken socket.
    serve(handlers, routes, logger, request, response).catch(() => response.destroy());
  });
}

async function serve(
  handlers: ApiHandlers,
  routes: readonly RouteDefinition[],
  logger: Logger,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const startedAt = performance.now();
  const correlationId = correlationOf(request);
  let operationId = 'unknown';
  let answer: JsonResponse;
  try {
    const url = new URL(request.url ?? '/', 'http://control-plane');
    const matched = match(routes, request.method ?? 'GET', url.pathname);
    if (matched === undefined) {
      answer = failureResponse(404, failure('not-found', 'no operation has this method and path'));
    } else if (!matched.ok) {
      answer = failureResponse(400, matched.error);
    } else {
      operationId = matched.value.route.operationId;
      answer = await answerRoute(handlers, matched.value, request, url, correlationId);
    }
  } catch (error) {
    answer = failureResponse(500, failure('internal', error instanceof Error ? error.message : String(error)));
  }
  if (!response.headersSent) writeJson(response, answer, correlationId);
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
  const principal = await authenticated(handlers, route.security, bearer);
  // Only a refused credential is 401; a store that is down is not.
  if (!principal.ok) return failureResponse(route.statuses[principal.error.code] ?? 500, principal.error);
  const body = route.body === undefined ? { ok: true as const, value: undefined } : await validatedBody(request, route.body);
  if (!body.ok) return failureResponse(400, body.error);
  const validated = { parameters, body: body.value, query: url.searchParams, correlationId, ...principal.value };
  const outcome = await handlers.handle(route.operationId, validated, bearer);
  if (!outcome.ok) return failureResponse(route.statuses[outcome.error.code] ?? 500, outcome.error);
  // A success that breaks its own schema is a defect, never sent as is.
  const checked = checkHttpSchema(route.response, outcome.value);
  if (checked.ok) return { status: route.success, body: outcome.value };
  return failureResponse(500, failure('internal', `the ${route.operationId} response violates ${route.response}`, { violation: checked.error[0] ?? '' }));
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

async function validatedBody(request: IncomingMessage, schema: keyof HttpSchemas & string): Promise<Result<unknown>> {
  const body = await readJsonBody(request);
  if (!body.ok) return body;
  const checked = checkHttpSchema(schema, body.value);
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

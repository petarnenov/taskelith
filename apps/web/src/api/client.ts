import type { paths } from '../generated/control-plane';

// A typed fetch over the control plane's generated OpenAPI types. Every
// request other than GET carries the session's CSRF token.

export const CSRF_HEADER = 'X-CSRF-Token';

export type Method = 'get' | 'put' | 'post' | 'delete' | 'patch';
export type ApiPath = keyof paths;

type Defined<T> = Exclude<T, undefined>;
export type Operation<P extends ApiPath, M extends Method> = Defined<paths[P][M]>;
export type MethodOf<P extends ApiPath> = { [M in Method]: paths[P][M] extends undefined ? never : M }[Method];

type JsonContent<T> = T extends { content: { 'application/json': infer Body } } ? Body : undefined;
type Parameters<O, Where extends 'path' | 'query'> = O extends { parameters: { [K in Where]?: infer Values } }
  ? Values
  : never;
type Responses<O> = O extends { responses: infer All } ? All : never;

export interface RequestOptions<O> {
  readonly path?: Parameters<O, 'path'>;
  readonly query?: Parameters<O, 'query'>;
  readonly body?: JsonContent<O extends { requestBody?: infer Body } ? Defined<Body> : never>;
}

export type ApiResult<O> = {
  [Status in keyof Responses<O>]: { readonly status: Status; readonly body: JsonContent<Responses<O>[Status]> };
}[keyof Responses<O>];

export interface ApiClientOptions {
  readonly csrfToken: () => string | undefined;
  readonly fetch?: typeof fetch;
}

export type ApiRequest = <P extends ApiPath, M extends MethodOf<P>>(
  method: M,
  path: P,
  options?: RequestOptions<Operation<P, M>>,
) => Promise<ApiResult<Operation<P, M>>>;

export function createApiClient({ csrfToken, fetch: send = globalThis.fetch }: ApiClientOptions): ApiRequest {
  return async function request<P extends ApiPath, M extends MethodOf<P>>(
    method: M,
    path: P,
    options: RequestOptions<Operation<P, M>> = {},
  ): Promise<ApiResult<Operation<P, M>>> {
    const response = await send(requestUrl(path, options), {
      method: method.toUpperCase(),
      headers: requestHeaders(method, options.body !== undefined, csrfToken),
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    // The body is the document's answer for the status; nothing checks it.
    return { status: response.status, body: await jsonBody(response) } as unknown as ApiResult<Operation<P, M>>;
  };
}

function requestUrl(path: string, { path: values, query }: { path?: unknown; query?: unknown }): string {
  return path.replace(/\{([^}]+)\}/g, (_, name: string) => pathValue(values, name)) + queryString(query);
}

function requestHeaders(method: Method, hasBody: boolean, csrfToken: () => string | undefined): Headers {
  const headers = new Headers({ Accept: 'application/json' });
  if (hasBody) headers.set('Content-Type', 'application/json');
  const token = method === 'get' ? undefined : csrfToken();
  if (token !== undefined) headers.set(CSRF_HEADER, token);
  return headers;
}

function pathValue(values: unknown, name: string): string {
  const value = (values as Record<string, unknown> | undefined)?.[name];
  if (value === undefined) throw new Error(`Missing path parameter ${name}`);
  return encodeURIComponent(String(value));
}

function queryString(values: unknown): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries((values as Record<string, unknown> | undefined) ?? {})) {
    if (value !== undefined) query.append(name, String(value));
  }
  const text = query.toString();
  return text === '' ? '' : `?${text}`;
}

async function jsonBody(response: Response): Promise<unknown> {
  const type = response.headers.get('Content-Type') ?? '';
  return /^application\/json\b/.test(type) ? response.json() : undefined;
}

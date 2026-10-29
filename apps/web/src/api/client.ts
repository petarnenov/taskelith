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
type Responses<O> = O extends { responses: infer All } ? All : never;
type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];

// One option of a request, required exactly when the operation requires it.
type Field<Name extends string, Value, IsRequired extends boolean> = IsRequired extends true
  ? { readonly [K in Name]: Value }
  : { readonly [K in Name]?: Value };

type ParameterField<O, Where extends 'path' | 'query'> = O extends { parameters: infer All }
  ? Field<Where, Defined<All[Where & keyof All]>, Where extends RequiredKeys<All> ? true : false>
  : Field<Where, never, false>;

type BodyField<O> = Field<
  'body',
  JsonContent<O extends { requestBody?: infer Body } ? Defined<Body> : never>,
  'requestBody' extends RequiredKeys<O> ? true : false
>;

export type RequestOptions<O> = ParameterField<O, 'path'> & ParameterField<O, 'query'> & BodyField<O>;

// The options argument may be left out only when no option is required.
type OptionsArgument<O> = [RequiredKeys<RequestOptions<O>>] extends [never]
  ? [options?: RequestOptions<O>]
  : [options: RequestOptions<O>];

export type DocumentedResult<O> = {
  [Status in keyof Responses<O>]: { readonly status: Status; readonly body: JsonContent<Responses<O>[Status]> };
}[keyof Responses<O>];

// A proxy or the infrastructure may answer with a status the document lacks.
export interface UndocumentedResult {
  readonly status: number;
  readonly body: unknown;
}

export type ApiResult<O> = DocumentedResult<O> | UndocumentedResult;

type DocumentedStatus<R> = R extends { readonly status: infer S } ? (number extends S ? never : S) : never;

export function hasStatus<R extends { readonly status: number }, const S extends DocumentedStatus<R>>(
  result: R,
  status: S,
): result is Extract<R, { readonly status: S }> {
  return result.status === status;
}

export interface ApiClientOptions {
  readonly csrfToken: () => string | undefined;
  readonly fetch?: typeof fetch;
}

export type ApiRequest = <P extends ApiPath, M extends MethodOf<P>>(
  method: M,
  path: P,
  ...options: OptionsArgument<Operation<P, M>>
) => Promise<ApiResult<Operation<P, M>>>;

interface UntypedOptions {
  readonly path?: unknown;
  readonly query?: unknown;
  readonly body?: unknown;
}

export function createApiClient({ csrfToken, fetch: send = globalThis.fetch }: ApiClientOptions): ApiRequest {
  async function request(method: Method, path: string, options: UntypedOptions = {}) {
    const response = await send(requestUrl(path, options), {
      method: method.toUpperCase(),
      headers: requestHeaders(method, options.body !== undefined, csrfToken),
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    return { status: response.status, body: await jsonBody(response) };
  }
  // The body is the document's answer for the status; nothing checks it.
  return request as unknown as ApiRequest;
}

function requestUrl(path: string, { path: values, query }: UntypedOptions): string {
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
  if (!/^application\/json\b/.test(type)) return undefined;
  const text = await response.text();
  return text === '' ? undefined : JSON.parse(text);
}

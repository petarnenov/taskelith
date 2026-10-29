import { describe, expect, it, vi } from 'vitest';
import { createApiClient, CSRF_HEADER, hasStatus, type RequestOptions } from '../src/api/client';

const TOKEN = 'csrf-fixture';

function recordingFetch(status = 200, body: unknown = { state: 'anonymous' }, type = 'application/json') {
  const calls: { url: string; init: RequestInit }[] = [];
  const send = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const payload = body === null ? null : JSON.stringify(body);
    return new Response(payload, { status, headers: body === null ? {} : { 'Content-Type': type } });
  });
  return { calls, send: send as unknown as typeof fetch };
}

function header(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name);
}

describe('createApiClient', () => {
  it('sends the CSRF token on a request other than GET', async () => {
    const { calls, send } = recordingFetch(200, { state: 'authenticated' });
    const request = createApiClient({ csrfToken: () => TOKEN, fetch: send });
    await request('post', '/session', { body: { loginName: 'operator', password: 'fixture-password' } });
    expect(calls[0]?.init.method).toBe('POST');
    expect(header(calls[0]!.init, CSRF_HEADER)).toBe(TOKEN);
    expect(header(calls[0]!.init, 'Content-Type')).toBe('application/json');
  });

  it('sends the CSRF token on DELETE without a body', async () => {
    const { calls, send } = recordingFetch(200, null);
    const request = createApiClient({ csrfToken: () => TOKEN, fetch: send });
    const result = await request('delete', '/session');
    expect(header(calls[0]!.init, CSRF_HEADER)).toBe(TOKEN);
    expect(header(calls[0]!.init, 'Content-Type')).toBeNull();
    expect(calls[0]?.init.body).toBeUndefined();
    expect(result).toEqual({ status: 200, body: undefined });
  });

  it('never sends the CSRF token on GET', async () => {
    const csrfToken = vi.fn(() => TOKEN);
    const { calls, send } = recordingFetch();
    const request = createApiClient({ csrfToken, fetch: send });
    const result = await request('get', '/session');
    expect(header(calls[0]!.init, CSRF_HEADER)).toBeNull();
    expect(csrfToken).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 200, body: { state: 'anonymous' } });
  });

  it('omits the header while no token is known', async () => {
    const { calls, send } = recordingFetch();
    const request = createApiClient({ csrfToken: () => undefined, fetch: send });
    await request('delete', '/session');
    expect(header(calls[0]!.init, CSRF_HEADER)).toBeNull();
  });

  it('keeps cookies same-origin and asks for JSON', async () => {
    const { calls, send } = recordingFetch();
    await createApiClient({ csrfToken: () => TOKEN, fetch: send })('get', '/session');
    expect(calls[0]?.init.credentials).toBe('same-origin');
    expect(header(calls[0]!.init, 'Accept')).toBe('application/json');
  });

  it('encodes path parameters and appends defined query parameters', async () => {
    const { calls, send } = recordingFetch();
    const request = createApiClient({ csrfToken: () => TOKEN, fetch: send });
    await request('get', '/projects/{projectId}/inbox', { path: { projectId: 'a b/c' }, query: { kind: undefined } });
    await request('get', '/projects/{projectId}/events', { path: { projectId: 'p1' }, query: { after: '7' } });
    expect(calls.map((call) => call.url)).toEqual(['/projects/a%20b%2Fc/inbox', '/projects/p1/events?after=7']);
  });

  it('refuses a request whose path parameter is missing', async () => {
    const { send } = recordingFetch();
    const request = createApiClient({ csrfToken: () => TOKEN, fetch: send });
    await expect(request('get', '/projects/{projectId}', {} as never)).rejects.toThrow('Missing path parameter projectId');
  });

  it('refuses at compile time a call without a required body or parameter', async () => {
    const { calls, send } = recordingFetch();
    const request = createApiClient({ csrfToken: () => TOKEN, fetch: send });
    // @ts-expect-error logIn requires its JSON body.
    await request('post', '/session');
    // @ts-expect-error logIn requires its JSON body.
    await request('post', '/session', {});
    // @ts-expect-error readProject requires the projectId path parameter.
    await expect(request('get', '/projects/{projectId}')).rejects.toThrow('projectId');
    // @ts-expect-error readProject requires the projectId path parameter.
    await expect(request('get', '/projects/{projectId}', {})).rejects.toThrow('projectId');
    await request('get', '/projects');
    expect(calls.map((call) => call.url)).toEqual(['/session', '/session', '/projects']);
  });

  it('requires a required query and keeps an optional one optional', () => {
    type Required = { parameters: { query: { after: string } } };
    type Optional = { parameters: { query?: { after?: string } } };
    // @ts-expect-error the query is required.
    const missing: RequestOptions<Required> = {};
    const omitted: RequestOptions<Optional> = {};
    expect([missing, omitted]).toEqual([{}, {}]);
  });

  it('reads no body from an answer that is not JSON', async () => {
    const { send } = recordingFetch(200, 'event: x', 'text/event-stream');
    const result = await createApiClient({ csrfToken: () => TOKEN, fetch: send })('get', '/session');
    expect(result.body).toBeUndefined();
  });

  it('reads no body from an empty JSON answer', async () => {
    const send = (async () =>
      new Response('', { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    const result = await createApiClient({ csrfToken: () => TOKEN, fetch: send })('delete', '/session');
    expect(result).toEqual({ status: 200, body: undefined });
  });

  it('types the body of an undocumented status as unknown', async () => {
    const { send } = recordingFetch(502, 'Bad Gateway', 'text/plain');
    const result = await createApiClient({ csrfToken: () => TOKEN, fetch: send })('get', '/session');
    if (result.status === 200) {
      // @ts-expect-error a proxy may answer 200 with any body.
      const state: string = result.body.state;
      expect(state).toBeUndefined();
    }
    expect(hasStatus(result, 200)).toBe(false);
    expect(result).toEqual({ status: 502, body: undefined });
  });

  it('narrows a documented status to its documented body', async () => {
    const { send } = recordingFetch(200, { state: 'anonymous' });
    const result = await createApiClient({ csrfToken: () => TOKEN, fetch: send })('get', '/session');
    const state = hasStatus(result, 200) ? result.body.state : 'none';
    // @ts-expect-error readSession documents no 418.
    hasStatus(result, 418);
    expect(state).toBe('anonymous');
  });
});

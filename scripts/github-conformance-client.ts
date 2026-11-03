import { createSign } from 'node:crypto';
import { CONFORMANCE_REPOSITORIES } from './github-conformance-settings.ts';

// The fixture's own way to GitHub, outside the plugin: the App's JWT and an
// installation token of the disposable repositories, over plain fetch.

const API_URL = 'https://api.github.com';
const GIT_URL = 'https://github.com';
const API_VERSION = '2022-11-28';
const USER_AGENT = 'taskelith-conformance';
const MINUTE_MS = 60_000;
// GitHub accepts an App JWT of at most ten minutes, issued in the past.
const JWT_BACKDATE_S = 60;
const JWT_LIFETIME_S = 9 * 60;
const TOKEN_RENEWAL_MS = 5 * MINUTE_MS;

export interface AppIdentity {
  readonly appId: string;
  readonly installationId: string;
  readonly privateKey: string;
}

export interface ApiReply {
  readonly status: number;
  readonly data: unknown;
}

interface CachedToken {
  readonly token: string;
  readonly expiry: number;
}

export class GithubNativeClient {
  private cached: CachedToken | undefined;
  private readonly identity: AppIdentity;
  private readonly fetch: typeof globalThis.fetch;
  private readonly now: () => number;

  constructor(identity: AppIdentity, fetch: typeof globalThis.fetch, now: () => number = Date.now) {
    this.identity = identity;
    this.fetch = fetch;
    this.now = now;
  }

  // As the App's installation, on the project and foreign repositories.
  async request(method: string, path: string, body?: unknown): Promise<ApiReply> {
    return this.requestWithToken(await this.token(), method, path, body);
  }

  async requestWithToken(token: string, method: string, path: string, body?: unknown): Promise<ApiReply> {
    return this.call(`token ${token}`, method, path, body);
  }

  // The Git smart HTTP advertisement, which GitHub refuses without access.
  async gitAdvertisement(repository: string, service: string, authorization: string): Promise<number> {
    const url = `${GIT_URL}/${repository}.git/info/refs?service=${service}`;
    const response = await this.fetch(url, { headers: { authorization, 'user-agent': USER_AGENT } });
    await response.body?.cancel();
    return response.status;
  }

  // Revokes the fixture's token; GitHub ends it within the hour anyway.
  async close(): Promise<void> {
    const cached = this.cached;
    this.cached = undefined;
    if (cached !== undefined) await this.requestWithToken(cached.token, 'DELETE', '/installation/token');
  }

  private async token(): Promise<string> {
    if (this.cached !== undefined && this.cached.expiry - TOKEN_RENEWAL_MS > this.now()) return this.cached.token;
    const repositories = [CONFORMANCE_REPOSITORIES.project, CONFORMANCE_REPOSITORIES.foreign].map(shortName);
    const path = `/app/installations/${this.identity.installationId}/access_tokens`;
    const minted = await this.call(`Bearer ${this.appJwt()}`, 'POST', path, { repositories });
    const data = minted.data as { token?: unknown; expires_at?: unknown } | null;
    const expiry = Date.parse(String(data?.expires_at));
    if (minted.status !== 201 || typeof data?.token !== 'string' || Number.isNaN(expiry)) {
      throw new Error(`the fixture's token request failed with status ${minted.status}`);
    }
    this.cached = { token: data.token, expiry };
    return data.token;
  }

  private appJwt(): string {
    const issuedAt = Math.floor(this.now() / 1000) - JWT_BACKDATE_S;
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64Url(JSON.stringify({ iat: issuedAt, exp: issuedAt + JWT_LIFETIME_S, iss: this.identity.appId }));
    const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(this.identity.privateKey, 'base64url');
    return `${header}.${claims}.${signature}`;
  }

  private async call(authorization: string, method: string, path: string, body?: unknown): Promise<ApiReply> {
    const headers = {
      accept: 'application/vnd.github+json',
      authorization,
      'user-agent': USER_AGENT,
      'x-github-api-version': API_VERSION,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    };
    const init = { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
    const response = await this.fetch(`${API_URL}${path}`, init);
    const text = await response.text();
    return { status: response.status, data: text.length === 0 ? null : parseJson(text) };
  }
}

export function shortName(repository: string): string {
  return repository.slice(repository.indexOf('/') + 1);
}

function base64Url(text: string): string {
  return Buffer.from(text).toString('base64url');
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

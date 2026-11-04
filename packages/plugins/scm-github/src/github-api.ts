import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/core';
import { err, ok, type Result } from '@taskelith/kernel';

// The adapter over Octokit: the rest of the plugin sees routes, plain data,
// and HTTP statuses, never Octokit's types or its error messages.

export const GITHUB_API_VERSION = '2022-11-28';
const USER_AGENT = 'taskelith-scm-github';

export interface GithubConnection {
  readonly appId: string;
  readonly installationId: string;
  // The App's private key in PEM; it never leaves this adapter.
  readonly privateKey: string;
  readonly baseUrl?: string;
  // Replaces global fetch, for tests against an emulated service.
  readonly fetch?: typeof fetch;
}

export interface GithubReply {
  readonly status: number;
  readonly data: unknown;
}

// The HTTP status of a refused request, or 0 when it failed locally;
// Octokit reports an unreachable service as status 500.
export interface GithubRefusal {
  readonly status: number;
}

export type GithubResult<T = GithubReply> = Result<T, GithubRefusal>;

// Octokit and auth-app log GitHub's messages to the console; none escape.
const SILENT_LOG = Object.freeze({ debug: discard, info: discard, warn: discard, error: discard });
type Parameters = Record<string, unknown>;

// Routes that GitHub answers only to the App's JWT, which auth-app signs.
export type AppRoute = 'POST /app/installations/{installation_id}/access_tokens' | 'GET /repos/{owner}/{repo}/installation';

export class GithubApi {
  private readonly app: Octokit;
  private readonly anonymous: Octokit;

  constructor(connection: GithubConnection) {
    const defaults = {
      baseUrl: connection.baseUrl ?? 'https://api.github.com',
      userAgent: USER_AGENT,
      log: SILENT_LOG,
      request: connection.fetch === undefined ? {} : { fetch: connection.fetch },
    };
    const auth = { appId: connection.appId, installationId: connection.installationId, privateKey: connection.privateKey };
    this.app = withApiVersion(new Octokit({ ...defaults, authStrategy: createAppAuth, auth }));
    this.anonymous = withApiVersion(new Octokit(defaults));
  }

  // As the App itself, by its JWT.
  asApp(route: AppRoute, parameters: Parameters = {}): Promise<GithubResult> {
    const untypedRoute: string = route;
    return settle(async () => reply(await this.app.request(untypedRoute, parameters)));
  }

  // As the App's installation, only with a token narrowed to the route's
  // repository: an installation-wide token is never requested.
  async asInstallation(route: string, parameters: Parameters): Promise<GithubResult> {
    const repository = parameters['repo'];
    if (typeof repository !== 'string') return err({ status: 0 });
    const token = await this.repositoryToken(repository);
    return token.ok ? this.withToken(token.value, route, parameters) : token;
  }

  // GitHub refuses a token for a repository the installation cannot see
  // with 422; to the caller that repository is not found, as with 404.
  private async repositoryToken(repository: string): Promise<GithubResult<string>> {
    const minted = await settle(async () => {
      const authentication = await this.app.auth({ type: 'installation', repositoryNames: [repository] });
      return (authentication as { token: string }).token;
    });
    return !minted.ok && minted.error.status === 422 ? err({ status: 404 }) : minted;
  }

  // As the holder of an installation token, such as a run's.
  withToken(token: string, route: string, parameters: Parameters = {}): Promise<GithubResult> {
    const headers = { authorization: `token ${token}` };
    return settle(async () => reply(await this.anonymous.request(route, { ...parameters, headers })));
  }
}

// Octokit sets no API version, so every request, its own token requests
// included, gets the pinned one.
function withApiVersion<Client extends Octokit>(client: Client): Client {
  client.hook.before('request', (options) => {
    options.headers['x-github-api-version'] = GITHUB_API_VERSION;
  });
  return client;
}

function discard(): void {}

function reply(response: { readonly status: number; readonly data: unknown }): GithubReply {
  return { status: response.status, data: response.data };
}

async function settle<T>(call: () => Promise<T>): Promise<GithubResult<T>> {
  try {
    return ok(await call());
  } catch (error) {
    return err({ status: statusOf(error) });
  }
}

// Octokit's request errors carry the response status; anything else
// failed in this process.
function statusOf(error: unknown): number {
  if (typeof error !== 'object' || error === null || !('status' in error)) return 0;
  const status = (error as { status: unknown }).status;
  return typeof status === 'number' && status >= 400 ? status : 0;
}

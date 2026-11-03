import { randomBytes, randomUUID, verify, type KeyObject } from 'node:crypto';

// A test-only GitHub REST API and Git HTTP transport behind an injected
// fetch, modelling only what the plugin relies on (design decision 9).

export const API_URL = 'https://api.github.test';
export const GIT_URL = 'https://github.test';
const TOKEN_LIFETIME_MS = 60 * 60 * 1000;
const APP_PERMISSIONS: Readonly<Record<string, string>> = Object.freeze({
  administration: 'write',
  contents: 'write',
  metadata: 'read',
  pull_requests: 'write',
  statuses: 'write',
});
const MERGE_METHOD_NAMES: Readonly<Record<string, string>> = Object.freeze({
  merge: 'merge-commit',
  squash: 'squash',
  rebase: 'rebase',
});

export interface EmulatorSetup {
  readonly appId: string;
  readonly installationId: string;
  readonly appPublicKey: KeyObject;
  // Full names of the repositories the App is installed on.
  readonly installed: readonly string[];
  // GitHub's names of the merge methods the repositories allow.
  readonly allowedMergeMethods?: readonly string[];
  readonly pageSize?: number;
  // How far the clock moves per token; by default none, as GitHub's
  // second-precision expiries repeat within one second.
  readonly mintClockStepMs?: number;
  // Defects: permissions added to every narrowed token, protection that
  // never binds an administrator, and token answers without an expiry.
  readonly alsoGrants?: Readonly<Record<string, string>>;
  readonly ignoresEnforceAdmins?: boolean;
  readonly omitsExpiry?: boolean;
}

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

interface Token {
  // Minted for a list of repositories, as a run's token is.
  readonly narrowed: boolean;
  readonly repositories: ReadonlySet<string>;
  readonly permissions: Readonly<Record<string, string>>;
  readonly expiresAt: number;
  revoked: boolean;
}

interface Pull {
  readonly number: number;
  readonly repository: string;
  readonly head: string;
  readonly base: string;
  state: 'open' | 'closed';
  mergedAt: string | null;
}

export interface Protection {
  readonly contexts: readonly string[];
  readonly strict: boolean;
  readonly enforceAdmins: boolean;
  readonly reviews?: Readonly<Record<string, unknown>>;
  readonly restrictions?: Readonly<Record<string, unknown>>;
  // The App each required context is bound to, by context.
  readonly apps?: Readonly<Record<string, number>>;
  // Names of GitHub's `{ enabled }` settings that are on.
  readonly enabled: readonly string[];
}

// The `{ enabled }` settings that a protection PUT may set.
const ENABLED_SETTINGS: readonly string[] = Object.freeze([
  'required_linear_history',
  'allow_force_pushes',
  'allow_deletions',
  'block_creations',
  'required_conversation_resolution',
  'lock_branch',
]);

interface Answer {
  readonly method: string;
  readonly path: RegExp;
  readonly reply: Reply;
}

interface Hold {
  readonly method: string;
  readonly path: RegExp;
  readonly reached: () => void;
  readonly released: Promise<void>;
}

export interface HeldRequest {
  readonly reached: Promise<void>;
  release(): void;
}

type Reply = readonly [status: number, data?: unknown, headers?: Record<string, string>];
type Route = (request: RecordedRequest, match: RegExpExecArray) => Reply;

export class GithubEmulator {
  readonly requests: RecordedRequest[] = [];
  private time = Date.now();
  private sequence = 0;
  private readonly tokens = new Map<string, Token>();
  private readonly branches = new Map<string, string>();
  private readonly protections = new Map<string, Protection>();
  private readonly statuses = new Map<string, string>();
  private readonly pulls = new Map<string, Pull>();
  private readonly mergedBy = new Map<string, string>();
  private readonly answers: Answer[] = [];
  private readonly holds: Hold[] = [];
  private revocationRefusal: number | undefined;
  private readonly routes: readonly (readonly [string, RegExp, Route])[];
  private readonly allowedMergeMethods: ReadonlySet<string>;

  private readonly setup: EmulatorSetup;

  constructor(setup: EmulatorSetup) {
    this.setup = setup;
    this.allowedMergeMethods = new Set(setup.allowedMergeMethods ?? Object.keys(MERGE_METHOD_NAMES));
    for (const repository of setup.installed) this.branches.set(branchKey(repository, 'main'), this.nextCommit());
    this.routes = [
      ['POST', /^\/app\/installations\/([^/]+)\/access_tokens$/, (request, match) => this.mintToken(request, match[1]!)],
      ['GET', /^\/installation\/repositories$/, (request) => this.listRepositories(request)],
      ['DELETE', /^\/installation\/token$/, (request) => this.revokeToken(request)],
      ['GET', /^\/repos\/([^/]+\/[^/]+)$/, (request, match) => this.readRepository(request, match[1]!)],
      ['GET', /^\/repos\/([^/]+\/[^/]+)\/branches\/([^/]+)\/protection$/, (request, match) => this.readProtection(request, match[1]!, match[2]!)],
      ['PUT', /^\/repos\/([^/]+\/[^/]+)\/branches\/([^/]+)\/protection$/, (request, match) => this.protect(request, match[1]!, match[2]!)],
      ['POST', /^\/repos\/([^/]+\/[^/]+)\/pulls$/, (request, match) => this.openPull(request, match[1]!)],
      ['GET', /^\/repos\/([^/]+\/[^/]+)\/pulls\/(\d+)$/, (request, match) => this.readPull(request, match[1]!, match[2]!)],
      ['PUT', /^\/repos\/([^/]+\/[^/]+)\/pulls\/(\d+)\/merge$/, (request, match) => this.merge(request, match[1]!, match[2]!)],
      ['POST', /^\/repos\/([^/]+\/[^/]+)\/statuses\/([^/]+)$/, (request, match) => this.postStatus(request, match[1]!, match[2]!)],
      ['GET', /^\/git\/([^/]+\/[^/]+)\.git\/info\/refs$/, (request, match) => this.gitAccess(request, match[1]!, 'read')],
      ['POST', /^\/git\/([^/]+\/[^/]+)\.git\/git-receive-pack$/, (request, match) => this.gitAccess(request, match[1]!, 'write')],
    ];
  }

  readonly fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const incoming = new Request(input, init);
    const url = new URL(incoming.url);
    const path = url.origin === GIT_URL ? `/git${url.pathname}` : url.pathname;
    const text = await incoming.text();
    const recorded = {
      method: incoming.method,
      path: `${path}${url.search}`,
      headers: Object.fromEntries(incoming.headers),
      body: text.length === 0 ? undefined : JSON.parse(text),
    };
    this.requests.push(recorded);
    await this.awaitRelease(recorded);
    const [status, data, headers] = this.route(recorded, path);
    const response = data === undefined ? new Response(null, { status, headers }) : Response.json(data, { status, headers });
    // A fetched response names its URL, which pagination reads.
    return Object.defineProperty(response, 'url', { value: incoming.url });
  };

  // Native means of the fixture and the tests, outside the plugin.
  refuseNext(method: string, path: RegExp, status: number): void {
    this.answerNext(method, path, status, { message: 'refused' });
  }

  // The next request whose path and query match gets this answer instead.
  answerNext(method: string, path: RegExp, status: number, data: unknown, headers?: Record<string, string>): void {
    this.answers.push({ method, path, reply: [status, data, headers] });
  }

  // Every token revocation fails with the status until it is undefined.
  refuseRevocations(status: number | undefined): void {
    this.revocationRefusal = status;
  }

  // Holds the next matching request until the test releases it.
  holdNext(method: string, path: RegExp): HeldRequest {
    let reached = (): void => {};
    let release = (): void => {};
    const reachedPromise = new Promise<void>((resolve) => { reached = resolve; });
    const released = new Promise<void>((resolve) => { release = resolve; });
    this.holds.push({ method, path, reached, released });
    return { reached: reachedPromise, release };
  }

  protectBranch(repository: string, branch: string, protection: Partial<Protection>): void {
    const base = { contexts: [], strict: false, enforceAdmins: false, enabled: [] };
    this.protections.set(branchKey(repository, branch), { ...base, ...protection });
  }

  protectionOf(repository: string, branch: string): Protection | undefined {
    return this.protections.get(branchKey(repository, branch));
  }

  createBranch(repository: string, branch: string): string {
    const commit = this.nextCommit();
    this.branches.set(branchKey(repository, branch), commit);
    return commit;
  }

  branchHead(repository: string, branch: string): string {
    return this.branches.get(branchKey(repository, branch)) ?? 'none';
  }

  methodOf(commit: string): string {
    return this.mergedBy.get(commit) ?? 'none';
  }

  // An unnarrowed token of the installation, as the App's own identity.
  installationToken(): string {
    return this.storeToken(new Set(this.setup.installed), APP_PERMISSIONS, false);
  }

  isTokenLive(token: string): boolean {
    const stored = this.tokens.get(token);
    return stored !== undefined && !stored.revoked && stored.expiresAt > this.time;
  }

  liveRunTokens(): number {
    return [...this.tokens].filter(([token, stored]) => stored.narrowed && this.isTokenLive(token)).length;
  }

  advance(milliseconds: number): void {
    this.time += milliseconds;
  }

  now(): number {
    return this.time;
  }

  // GitHub's own spelling of an installed repository, matched without case.
  private installedName(repository: string): string | undefined {
    return this.setup.installed.find((name) => name.toLowerCase() === repository.toLowerCase());
  }

  private route(request: RecordedRequest, path: string): Reply {
    const answer = this.answers.findIndex((next) => next.method === request.method && next.path.test(request.path));
    if (answer !== -1) return this.answers.splice(answer, 1)[0]!.reply;
    for (const [method, pattern, route] of this.routes) {
      const match = pattern.exec(path);
      if (match !== null && method === request.method) return route(request, match);
    }
    return [404, { message: 'Not Found' }];
  }

  private mintToken(request: RecordedRequest, installationId: string): Reply {
    if (!this.isAppJwt(request.headers['authorization'] ?? '')) return [401, { message: 'Bad credentials' }];
    if (installationId !== this.setup.installationId) return [404, { message: 'Not Found' }];
    const body = (request.body ?? {}) as { repositories?: string[]; permissions?: Record<string, string> };
    const owner = this.setup.installed[0]!.split('/')[0];
    const names = body.repositories?.map((name) => this.installedName(`${owner}/${name}`)) ?? [...this.setup.installed];
    if (!names.every((name): name is string => name !== undefined)) return [422, { message: 'Not accessible' }];
    const permissions = body.permissions ?? APP_PERMISSIONS;
    if (!Object.entries(permissions).every(([name, level]) => grants(APP_PERMISSIONS[name], level))) {
      return [422, { message: 'Permission not granted to the App' }];
    }
    this.time += this.setup.mintClockStepMs ?? 0;
    const granted = { ...permissions, ...this.setup.alsoGrants, metadata: 'read' };
    const token = this.storeToken(new Set(names), granted, body.repositories !== undefined);
    const repositories = names.map((full_name) => ({ full_name, name: full_name.split('/')[1] }));
    const expiresAt = new Date(this.tokens.get(token)!.expiresAt).toISOString().replace(/\.\d{3}Z$/, 'Z');
    return [201, {
      token,
      expires_at: this.setup.omitsExpiry === true ? null : expiresAt,
      permissions: granted,
      repository_selection: 'selected',
      ...(body.repositories === undefined ? {} : { repositories }),
    }];
  }

  private listRepositories(request: RecordedRequest): Reply {
    const token = this.tokenOf(request);
    if (token === undefined) return [401, { message: 'Bad credentials' }];
    const url = new URL(request.path, API_URL);
    const page = Number(url.searchParams.get('page') ?? '1');
    const size = this.setup.pageSize ?? Number(url.searchParams.get('per_page') ?? '30');
    const all = [...token.repositories].map((full_name) => ({ full_name }));
    const repositories = all.slice((page - 1) * size, page * size);
    const next = page * size < all.length ? { link: `<${API_URL}/installation/repositories?per_page=${size}&page=${page + 1}>; rel="next"` } : undefined;
    return [200, { total_count: all.length, repositories }, next];
  }

  private revokeToken(request: RecordedRequest): Reply {
    if (this.revocationRefusal !== undefined) return [this.revocationRefusal, { message: 'refused' }];
    const presented = /^token (.+)$/.exec(request.headers['authorization'] ?? '')?.[1];
    const token = presented === undefined ? undefined : this.tokens.get(presented);
    if (token === undefined || !this.isTokenLive(presented!)) return [401, { message: 'Bad credentials' }];
    token.revoked = true;
    return [204];
  }

  private readRepository(request: RecordedRequest, repository: string): Reply {
    const refused = this.authorize(this.tokenOf(request), repository, 'metadata', 'read');
    if (refused !== undefined) return refused;
    return [200, { full_name: repository, clone_url: `${GIT_URL}/${repository}.git` }];
  }

  private readProtection(request: RecordedRequest, repository: string, branch: string): Reply {
    const refused = this.authorize(this.tokenOf(request), repository, 'administration', 'read');
    if (refused !== undefined) return refused;
    const protection = this.protections.get(branchKey(repository, branch));
    return protection === undefined ? [404, { message: 'Branch not protected' }] : [200, protectionData(protection)];
  }

  private protect(request: RecordedRequest, repository: string, branch: string): Reply {
    const refused = this.authorize(this.tokenOf(request), repository, 'administration', 'write');
    if (refused !== undefined) return refused;
    const body = request.body as Record<string, unknown> & {
      required_status_checks: { strict: boolean; contexts: string[] };
      enforce_admins: boolean;
    };
    // A PUT replaces the whole protection; omitted settings turn off.
    const protection = {
      contexts: [...body.required_status_checks.contexts],
      strict: body.required_status_checks.strict,
      enforceAdmins: body.enforce_admins && !this.setup.ignoresEnforceAdmins,
      ...settingOf('reviews', body['required_pull_request_reviews']),
      ...settingOf('restrictions', body['restrictions']),
      enabled: ENABLED_SETTINGS.filter((name) => body[name] === true),
    };
    this.protections.set(branchKey(repository, branch), protection);
    return [200, protectionData(protection)];
  }

  private openPull(request: RecordedRequest, repository: string): Reply {
    const refused = this.authorize(this.tokenOf(request), repository, 'pull_requests', 'write');
    if (refused !== undefined) return refused;
    const body = request.body as { head: string; base: string };
    if (!this.branches.has(branchKey(repository, body.head))) return [422, { message: 'Validation Failed' }];
    const number = this.next();
    const pull = { number, repository, head: body.head, base: body.base, state: 'open' as const, mergedAt: null };
    this.pulls.set(`${repository}#${number}`, pull);
    return [201, this.pullData(pull)];
  }

  private readPull(request: RecordedRequest, repository: string, number: string): Reply {
    const refused = this.authorize(this.tokenOf(request), repository, 'pull_requests', 'read');
    if (refused !== undefined) return refused;
    const pull = this.pulls.get(`${repository}#${number}`);
    return pull === undefined ? [404, { message: 'Not Found' }] : [200, this.pullData(pull)];
  }

  // Protection binds an administrator only with enforce_admins, as the
  // GitHub qualification observed.
  private merge(request: RecordedRequest, repository: string, number: string): Reply {
    const token = this.tokenOf(request);
    const refused = this.authorize(token, repository, 'contents', 'write');
    if (refused !== undefined) return refused;
    const pull = this.pulls.get(`${repository}#${number}`);
    if (pull === undefined) return [404, { message: 'Not Found' }];
    const body = (request.body ?? {}) as { sha?: string; merge_method?: string };
    const method = body.merge_method ?? 'merge';
    if (pull.state !== 'open' || !this.allowedMergeMethods.has(method)) {
      return [405, { message: 'Pull Request is not mergeable' }];
    }
    const head = this.branchHead(repository, pull.head);
    if (body.sha !== undefined && body.sha !== head) return [409, { message: 'Head branch was modified' }];
    const protection = this.protections.get(branchKey(repository, pull.base));
    const isAdmin = grants(token!.permissions['administration'], 'write');
    const blocked = protection !== undefined && !protection.contexts.every((context) => this.statusOf(repository, head, context) === 'success');
    if (blocked && (protection.enforceAdmins || !isAdmin)) return [405, { message: 'Required status check is expected' }];
    const commit = this.createBranch(repository, pull.base);
    this.mergedBy.set(commit, MERGE_METHOD_NAMES[method]!);
    pull.state = 'closed';
    pull.mergedAt = new Date(this.time).toISOString();
    return [200, { sha: commit, merged: true, message: 'Pull Request successfully merged' }];
  }

  private postStatus(request: RecordedRequest, repository: string, sha: string): Reply {
    const refused = this.authorize(this.tokenOf(request), repository, 'statuses', 'write');
    if (refused !== undefined) return refused;
    const body = request.body as { state: string; context?: string };
    const context = body.context ?? 'default';
    this.statuses.set(`${repository}@${sha}:${context}`, body.state);
    return [201, { state: body.state, context }];
  }

  // Git sends the run credential's authorization as Basic credentials.
  private gitAccess(request: RecordedRequest, repository: string, level: 'read' | 'write'): Reply {
    const basic = /^Basic (.+)$/.exec(request.headers['authorization'] ?? '')?.[1];
    const decoded = basic === undefined ? '' : Buffer.from(basic, 'base64').toString();
    const token = decoded.startsWith('x-access-token:') ? this.liveToken(decoded.slice('x-access-token:'.length)) : undefined;
    const refused = this.authorize(token, repository, 'contents', level);
    if (refused !== undefined) return refused;
    if (level === 'write') this.createBranch(repository, 'emulated-pushes');
    return [200, { service: level === 'read' ? 'git-upload-pack' : 'git-receive-pack' }];
  }

  private async awaitRelease(request: RecordedRequest): Promise<void> {
    const held = this.holds.findIndex((hold) => hold.method === request.method && hold.path.test(request.path));
    if (held === -1) return;
    const [hold] = this.holds.splice(held, 1);
    hold!.reached();
    await hold!.released;
  }

  private authorize(token: Token | undefined, repository: string, permission: string, level: 'read' | 'write'): Reply | undefined {
    if (token === undefined) return [401, { message: 'Bad credentials' }];
    if (!token.repositories.has(repository)) return [404, { message: 'Not Found' }];
    const granted = token.permissions[permission];
    return grants(granted, level) || permission === 'metadata' ? undefined : [403, { message: 'Resource not accessible by integration' }];
  }

  private tokenOf(request: RecordedRequest): Token | undefined {
    return this.liveToken(/^token (.+)$/.exec(request.headers['authorization'] ?? '')?.[1]);
  }

  private liveToken(presented: string | undefined): Token | undefined {
    return presented !== undefined && this.isTokenLive(presented) ? this.tokens.get(presented) : undefined;
  }

  private storeToken(repositories: ReadonlySet<string>, permissions: Readonly<Record<string, string>>, narrowed: boolean): string {
    const token = `ghs_${randomBytes(27).toString('base64url')}`;
    this.tokens.set(token, { narrowed, repositories, permissions, expiresAt: this.time + TOKEN_LIFETIME_MS, revoked: false });
    return token;
  }

  // An RS256 JWT that the App's key signed, issued by the App.
  private isAppJwt(authorization: string): boolean {
    const jwt = /^bearer (.+)$/i.exec(authorization)?.[1];
    const [header, payload, signature] = jwt?.split('.') ?? [];
    if (header === undefined || payload === undefined || signature === undefined) return false;
    const signed = verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), this.setup.appPublicKey, Buffer.from(signature, 'base64url'));
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { iss?: unknown };
    return signed && String(claims.iss) === this.setup.appId;
  }

  private statusOf(repository: string, commit: string, context: string): string | undefined {
    return this.statuses.get(`${repository}@${commit}:${context}`);
  }

  private pullData(pull: Pull): unknown {
    return {
      number: pull.number,
      html_url: `${GIT_URL}/${pull.repository}/pull/${pull.number}`,
      state: pull.state,
      merged_at: pull.mergedAt,
      head: { ref: pull.head, sha: this.branchHead(pull.repository, pull.head) },
      base: { ref: pull.base },
    };
  }

  private nextCommit(): string {
    return `${this.next().toString(16).padStart(8, '0')}${randomUUID().replaceAll('-', '')}`;
  }

  private next(): number {
    this.sequence += 1;
    return this.sequence;
  }
}

function branchKey(repository: string, branch: string): string {
  return `${repository}#${branch}`;
}

function grants(granted: string | undefined, level: string): boolean {
  return granted === 'write' || (granted === 'read' && level === 'read');
}

function settingOf(name: 'reviews' | 'restrictions', value: unknown): Partial<Protection> {
  return typeof value === 'object' && value !== null ? { [name]: value as Record<string, unknown> } : {};
}

// GitHub's answer omits review and push settings that are off.
function protectionData(protection: Protection): unknown {
  return {
    required_status_checks: {
      strict: protection.strict,
      contexts: protection.contexts,
      checks: protection.contexts.map((context) => ({ context, app_id: protection.apps?.[context] ?? null })),
    },
    enforce_admins: { enabled: protection.enforceAdmins },
    ...(protection.reviews === undefined ? {} : { required_pull_request_reviews: protection.reviews }),
    ...(protection.restrictions === undefined ? {} : { restrictions: protection.restrictions }),
    ...Object.fromEntries(ENABLED_SETTINGS.map((name) => [name, { enabled: protection.enabled.includes(name) }])),
  };
}

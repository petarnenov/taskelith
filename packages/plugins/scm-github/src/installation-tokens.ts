import { err, failure, ok, type Failure, type Result } from '@taskelith/kernel';
import type { GithubApi, GithubRefusal } from './github-api.js';
import { malformed, recordOf, refusal, textOf, type JsonRecord } from './github-data.js';
import { effectivePermissions, githubPermissions, isExactGrant } from './permissions.js';
import { parseRepository } from './repository-name.js';

// Installation access tokens narrowed to a run's repositories and
// permissions, minted and revoked at GitHub.

export interface TokenGrant {
  readonly repositories: readonly string[];
  readonly permissions: readonly string[];
}

export interface InstallationToken extends TokenGrant {
  readonly token: string;
  // A kernel instant.
  readonly expiresAt: string;
}

interface TokenRequest {
  readonly repositories: string[];
  readonly permissions: Readonly<Record<string, string>>;
}

const VISIBLE_ASCII = /^[\x21-\x7e]+$/;

export class InstallationTokens {
  // Tokens the plugin refused whose revocation GitHub has not confirmed.
  private readonly discarded = new Set<string>();

  constructor(
    private readonly api: GithubApi,
    private readonly installationId: string,
  ) {}

  // Exactly the requested repositories and permissions, only for
  // repositories of the installation; any other token is discarded.
  async mint(grant: TokenGrant): Promise<Result<InstallationToken>> {
    await this.retryDiscarded();
    const requested = tokenRequest(grant);
    if (!requested.ok) return requested;
    const minted = await this.api.asApp('POST /app/installations/{installation_id}/access_tokens', {
      installation_id: this.installationId,
      ...requested.value,
    });
    if (!minted.ok) return err(await this.mintRefusal(minted.error, grant.repositories));
    const data = recordOf(minted.value.data);
    const token = tokenOf(data);
    if (token === undefined) return err(malformed('an installation token request'));
    const read = readGrant(token, data, grant.repositories, requested.value.permissions);
    if (!read.ok) await this.discard(token);
    return read;
  }

  // Revoked now or already invalid (401); any other answer leaves the
  // token live and fails with `unavailable`, so the caller retries.
  async revoke(token: string): Promise<Result<void>> {
    await this.retryDiscarded();
    return this.revokeAtGithub(token);
  }

  // Revokes a token no caller will use; a failure is retried later.
  async discard(token: string): Promise<void> {
    const revoked = await this.revokeAtGithub(token);
    if (!revoked.ok) this.discarded.add(token);
  }

  private async retryDiscarded(): Promise<void> {
    for (const token of [...this.discarded]) {
      this.discarded.delete(token);
      await this.discard(token);
    }
  }

  private async revokeAtGithub(token: string): Promise<Result<void>> {
    const revoked = await this.api.withToken(token, 'DELETE /installation/token');
    if (revoked.ok || revoked.error.status === 401) return ok(undefined);
    const status = String(revoked.error.status);
    return err(failure('unavailable', 'GitHub did not confirm a token revocation', { status }));
  }

  // GitHub refuses a repository outside the installation with 422, as it
  // does other invalid requests; only then are the repositories looked up.
  private async mintRefusal(refused: GithubRefusal, repositories: readonly string[]): Promise<Failure> {
    const failed = refusal(refused, 'issue an installation token');
    if (refused.status !== 422) return failed;
    for (const repository of repositories) {
      const installed = await this.isInstalled(repository);
      if (!installed.ok) return installed.error;
      if (!installed.value) return outsideInstallation();
    }
    return failed;
  }

  // By the App's JWT, so no installation token is needed for the answer.
  private async isInstalled(repository: string): Promise<Result<boolean>> {
    const name = parseRepository(repository);
    if (!name.ok) return name;
    const read = await this.api.asApp('GET /repos/{owner}/{repo}/installation', { ...name.value });
    if (!read.ok) return read.error.status === 404 ? ok(false) : err(refusal(read.error, "read a repository's installation"));
    return ok(String(recordOf(read.value.data)['id']) === this.installationId);
  }
}

function tokenRequest(grant: TokenGrant): Result<TokenRequest> {
  const permissions = githubPermissions(grant.permissions);
  if (!permissions.ok) return permissions;
  if (grant.repositories.length === 0) return err(failure('invalid', 'A run credential needs at least one repository'));
  const names: string[] = [];
  for (const repository of grant.repositories) {
    const parsed = parseRepository(repository);
    if (!parsed.ok) return parsed;
    names.push(parsed.value.repo);
  }
  return ok({ repositories: names, permissions: permissions.value });
}

// GitHub matches repository names regardless of case.
function repositoryKey(repository: string): string {
  return repository.toLowerCase();
}

function outsideInstallation(): Failure {
  return failure('not-found', 'A run credential names a repository outside the installation');
}

function tokenOf(data: JsonRecord): string | undefined {
  const token = textOf(data['token']);
  return token !== undefined && VISIBLE_ASCII.test(token) ? token : undefined;
}

// The token's grant must equal the request (source control contract
// section 3); another owner's repositories are outside the installation.
function readGrant(
  token: string,
  data: JsonRecord,
  repositories: readonly string[],
  permissions: Readonly<Record<string, string>>,
): Result<InstallationToken> {
  const expiry = Date.parse(textOf(data['expires_at']) ?? '');
  if (Number.isNaN(expiry)) return err(malformed('an installation token request'));
  const granted = Array.isArray(data['repositories'])
    ? data['repositories'].map((repository) => textOf(recordOf(repository)['full_name']) ?? '')
    : [];
  if (!isSameSet(repositories.map(repositoryKey), granted.map(repositoryKey))) return err(outsideInstallation());
  const grantedPermissions = recordOf(data['permissions']);
  if (!isExactGrant(permissions, grantedPermissions)) {
    return err(failure('internal', 'GitHub granted other permissions than requested'));
  }
  const effective = effectivePermissions(grantedPermissions);
  return ok({ token, expiresAt: new Date(expiry).toISOString(), repositories: [...repositories], permissions: effective });
}

function isSameSet(left: readonly string[], right: readonly string[]): boolean {
  const set = new Set(left);
  return set.size === new Set(right).size && right.every((entry) => set.has(entry));
}

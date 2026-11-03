import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { GithubApi } from './github-api.js';
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
    const requested = await this.tokenRequest(grant);
    if (!requested.ok) return requested;
    const minted = await this.api.asApp('POST /app/installations/{installation_id}/access_tokens', {
      installation_id: this.installationId,
      ...requested.value,
    });
    if (!minted.ok) return err(refusal(minted.error, 'issue an installation token'));
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

  private async tokenRequest(grant: TokenGrant): Promise<Result<TokenRequest>> {
    const permissions = githubPermissions(grant.permissions);
    if (!permissions.ok) return permissions;
    if (grant.repositories.length === 0) return err(failure('invalid', 'A run credential needs at least one repository'));
    const names: string[] = [];
    for (const repository of grant.repositories) {
      const parsed = parseRepository(repository);
      if (!parsed.ok) return parsed;
      names.push(parsed.value.repo);
    }
    const installed = await this.installedRepositories();
    if (!installed.ok) return installed;
    if (!grant.repositories.every((repository) => installed.value.has(repository))) {
      return err(failure('not-found', 'A run credential names a repository outside the installation'));
    }
    return ok({ repositories: names, permissions: permissions.value });
  }

  private async installedRepositories(): Promise<Result<ReadonlySet<string>>> {
    const listed = await this.api.listAsApp('GET /installation/repositories');
    if (!listed.ok) return err(refusal(listed.error, "list the installation's repositories"));
    return ok(new Set(listed.value.map((repository) => textOf(recordOf(repository)['full_name']) ?? '')));
  }
}

function tokenOf(data: JsonRecord): string | undefined {
  const token = textOf(data['token']);
  return token !== undefined && VISIBLE_ASCII.test(token) ? token : undefined;
}

// The token's grant must equal the request (source control contract
// section 3); its expiry is a kernel instant.
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
  const grantedPermissions = recordOf(data['permissions']);
  if (!isSameSet(repositories, granted) || !isExactGrant(permissions, grantedPermissions)) {
    return err(failure('internal', 'GitHub granted other repositories or permissions than requested'));
  }
  const effective = effectivePermissions(grantedPermissions);
  return ok({ token, expiresAt: new Date(expiry).toISOString(), repositories: granted, permissions: effective });
}

function isSameSet(left: readonly string[], right: readonly string[]): boolean {
  const set = new Set(left);
  return set.size === new Set(right).size && right.every((entry) => set.has(entry));
}

import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { GithubApi } from './github-api.js';
import { malformed, recordOf, refusal, textOf } from './github-data.js';
import { effectivePermissions, githubPermissions } from './permissions.js';
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

const VISIBLE_ASCII = /^[\x21-\x7e]+$/;

export class InstallationTokens {
  constructor(
    private readonly api: GithubApi,
    private readonly installationId: string,
  ) {}

  // Only for repositories of the installation; a token whose grant
  // `accepts` refuses is revoked at once.
  async mint(grant: TokenGrant, accepts: (granted: TokenGrant) => boolean): Promise<Result<InstallationToken>> {
    const requested = await this.tokenRequest(grant);
    if (!requested.ok) return requested;
    const minted = await this.api.asApp('POST /app/installations/{installation_id}/access_tokens', {
      installation_id: this.installationId,
      ...requested.value,
    });
    if (!minted.ok) return err(refusal(minted.error, 'issue an installation token'));
    const token = readToken(minted.value.data);
    if (token === undefined) return err(malformed('an installation token request'));
    if (accepts(token)) return ok(token);
    await this.revoke(token.token);
    return err(failure('internal', 'GitHub granted other repositories or permissions than requested'));
  }

  // True once the token no longer works: revoked now, or already invalid.
  async revoke(token: string): Promise<Result<void>> {
    const revoked = await this.api.withToken(token, 'DELETE /installation/token');
    if (revoked.ok || revoked.error.status === 401) return ok(undefined);
    return err(refusal(revoked.error, 'revoke an installation token'));
  }

  private async tokenRequest(grant: TokenGrant): Promise<Result<{ repositories: string[]; permissions: Record<string, string> }>> {
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
    return ok({ repositories: names, permissions: { ...permissions.value } });
  }

  private async installedRepositories(): Promise<Result<ReadonlySet<string>>> {
    const listed = await this.api.listAsApp('GET /installation/repositories');
    if (!listed.ok) return err(refusal(listed.error, "list the installation's repositories"));
    return ok(new Set(listed.value.map((repository) => textOf(recordOf(repository)['full_name']) ?? '')));
  }
}

function readToken(data: unknown): InstallationToken | undefined {
  const record = recordOf(data);
  const token = textOf(record['token']);
  const expiry = Date.parse(textOf(record['expires_at']) ?? '');
  if (token === undefined || !VISIBLE_ASCII.test(token) || Number.isNaN(expiry)) return undefined;
  const repositories = Array.isArray(record['repositories'])
    ? record['repositories'].map((repository) => textOf(recordOf(repository)['full_name']) ?? '')
    : [];
  const permissions = effectivePermissions(recordOf(record['permissions']));
  return { token, expiresAt: new Date(expiry).toISOString(), repositories, permissions };
}

// Exactly the requested repositories, every requested permission, and
// write-code only on request (source control contract section 3).
export function coversRequest(request: TokenGrant): (granted: TokenGrant) => boolean {
  return (granted) => isSameSet(request.repositories, granted.repositories)
    && request.permissions.every((permission) => granted.permissions.includes(permission))
    && (request.permissions.includes('write-code') || !granted.permissions.includes('write-code'));
}

// A refresh keeps the repositories and the effective permissions.
export function equalsGrant(grant: TokenGrant): (granted: TokenGrant) => boolean {
  return (granted) => isSameSet(grant.repositories, granted.repositories) && isSameSet(grant.permissions, granted.permissions);
}

function isSameSet(left: readonly string[], right: readonly string[]): boolean {
  const set = new Set(left);
  return set.size === new Set(right).size && right.every((entry) => set.has(entry));
}

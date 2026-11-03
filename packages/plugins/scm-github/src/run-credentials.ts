import { randomUUID } from 'node:crypto';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { draft } from '@taskelith/plugin-sdk';
import type { InstallationToken, InstallationTokens, TokenGrant } from './installation-tokens.js';

type RunCredential = draft.RunCredential;

// A version holds its token until it ends; then only its number remains.
interface CredentialVersion {
  token: string | undefined;
}

interface RunCredentialVersion {
  readonly minted: InstallationToken;
  readonly version: number;
}

interface StoredCredential {
  readonly runId: string;
  readonly grant: TokenGrant;
  readonly versions: CredentialVersion[];
  // GitHub's expiry of the newest version, in epoch milliseconds.
  latestExpiry: number;
  // Refreshes still waiting for GitHub, which a revocation waits for.
  readonly refreshing: Set<Promise<Result<RunCredentialVersion>>>;
  revoked: boolean;
}

// Credential versions live in this process only. After a restart every
// credential is unknown, and its tokens end at GitHub's own expiry.
export class GithubRunCredentials {
  private readonly credentials = new Map<string, StoredCredential>();

  constructor(private readonly tokens: InstallationTokens) {}

  async issueRunCredential(request: draft.RunCredentialRequest): Promise<Result<RunCredential>> {
    const requested = { repositories: [...request.repositories], permissions: [...request.permissions] };
    const minted = await this.tokens.mint(requested);
    if (!minted.ok) return minted;
    const credentialId = randomUUID();
    const { repositories, permissions, token, expiresAt } = minted.value;
    const stored: StoredCredential = {
      runId: request.runId,
      grant: { repositories, permissions },
      versions: [{ token }],
      latestExpiry: Date.parse(expiresAt),
      refreshing: new Set(),
      revoked: false,
    };
    this.credentials.set(credentialId, stored);
    return ok(runCredential(credentialId, stored, { minted: minted.value, version: 1 }));
  }

  async refreshRunCredential({ credentialId }: draft.RunCredentialReference): Promise<Result<RunCredential>> {
    const stored = this.live(credentialId);
    if (!stored.ok) return stored;
    const refreshing = this.nextVersion(stored.value);
    stored.value.refreshing.add(refreshing);
    try {
      const next = await refreshing;
      if (!next.ok) return next;
      return ok(runCredential(credentialId, stored.value, next.value));
    } finally {
      stored.value.refreshing.delete(refreshing);
    }
  }

  async confirmRunCredentialAdoption({ credentialId, version }: draft.RunCredentialAdoption): Promise<Result<void>> {
    const stored = this.live(credentialId);
    if (!stored.ok) return stored;
    const { versions } = stored.value;
    if (!Number.isSafeInteger(version) || version < 1 || version > versions.length) {
      return err(failure('not-found', 'Unknown run credential version'));
    }
    return this.end(versions.slice(0, version - 1));
  }

  // A failed revocation at GitHub keeps the credential, so a retry ends the
  // rest; it no longer refreshes or confirms an adoption.
  async revokeRunCredential({ credentialId }: draft.RunCredentialReference): Promise<Result<void>> {
    const stored = this.credentials.get(credentialId);
    if (stored === undefined) return err(unknownCredential());
    stored.revoked = true;
    await Promise.allSettled(stored.refreshing);
    const ended = await this.end(stored.versions);
    if (ended.ok) this.credentials.delete(credentialId);
    return ended;
  }

  // A token minted after a revocation still joins the versions, which it
  // ends; one that does not extend the expiry is discarded.
  private async nextVersion(stored: StoredCredential): Promise<Result<RunCredentialVersion>> {
    const minted = await this.tokens.mint(stored.grant);
    if (!minted.ok) return minted;
    const { token, expiresAt } = minted.value;
    if (stored.revoked) {
      stored.versions.push({ token });
      return err(unknownCredential());
    }
    const expiry = Date.parse(expiresAt);
    if (expiry <= stored.latestExpiry) {
      await this.tokens.discard(token);
      return err(failure('unavailable', 'GitHub gave the refresh no later expiry; retry after a second'));
    }
    stored.versions.push({ token });
    stored.latestExpiry = expiry;
    return ok({ minted: minted.value, version: stored.versions.length });
  }

  private live(credentialId: string): Result<StoredCredential> {
    const stored = this.credentials.get(credentialId);
    return stored === undefined || stored.revoked ? err(unknownCredential()) : ok(stored);
  }

  // Revokes each version's token at GitHub; a version ends only then.
  private async end(versions: readonly CredentialVersion[]): Promise<Result<void>> {
    let outcome: Result<void> = ok(undefined);
    for (const version of versions) {
      if (version.token === undefined) continue;
      const revoked = await this.tokens.revoke(version.token);
      if (revoked.ok) version.token = undefined;
      else outcome = revoked;
    }
    return outcome;
  }
}

function runCredential(credentialId: string, stored: StoredCredential, { minted, version }: RunCredentialVersion): RunCredential {
  return {
    credentialId,
    runId: stored.runId,
    version,
    secret: minted.token,
    authorization: basicAuthorization(minted.token),
    repositories: [...stored.grant.repositories],
    permissions: [...stored.grant.permissions],
    expiresAt: minted.expiresAt,
  };
}

// Git over HTTPS takes an installation token as Basic credentials (Git
// workspace contract section 14).
export function basicAuthorization(token: string): string {
  return `Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
}

function unknownCredential() {
  return failure('not-found', 'Unknown or revoked run credential');
}

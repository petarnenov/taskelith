import { randomUUID } from 'node:crypto';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { draft } from '@taskelith/plugin-sdk';
import { coversRequest, equalsGrant, type InstallationToken, type InstallationTokens, type TokenGrant } from './installation-tokens.js';

type RunCredential = draft.RunCredential;

// A version holds its token until it ends; then only its number remains.
interface CredentialVersion {
  token: string | undefined;
}

interface StoredCredential {
  readonly runId: string;
  readonly grant: TokenGrant;
  readonly versions: CredentialVersion[];
  revoked: boolean;
}

// Credential versions live in this process only. After a restart every
// credential is unknown, and its tokens end at GitHub's own expiry.
export class GithubRunCredentials {
  private readonly credentials = new Map<string, StoredCredential>();

  constructor(private readonly tokens: InstallationTokens) {}

  async issueRunCredential(request: draft.RunCredentialRequest): Promise<Result<RunCredential>> {
    const requested = { repositories: [...request.repositories], permissions: [...request.permissions] };
    const minted = await this.tokens.mint(requested, coversRequest(requested));
    if (!minted.ok) return minted;
    const credentialId = randomUUID();
    const { repositories, permissions, token } = minted.value;
    const stored = { runId: request.runId, grant: { repositories, permissions }, versions: [{ token }], revoked: false };
    this.credentials.set(credentialId, stored);
    return ok(runCredential(credentialId, stored, minted.value));
  }

  async refreshRunCredential({ credentialId }: draft.RunCredentialReference): Promise<Result<RunCredential>> {
    const before = this.live(credentialId);
    if (!before.ok) return before;
    const minted = await this.tokens.mint(before.value.grant, equalsGrant(before.value.grant));
    if (!minted.ok) return minted;
    const stored = this.live(credentialId);
    if (!stored.ok) {
      await this.tokens.revoke(minted.value.token);
      return stored;
    }
    stored.value.versions.push({ token: minted.value.token });
    return ok(runCredential(credentialId, stored.value, minted.value));
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
    const ended = await this.end(stored.versions);
    if (ended.ok) this.credentials.delete(credentialId);
    return ended;
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

function runCredential(credentialId: string, stored: StoredCredential, minted: InstallationToken): RunCredential {
  return {
    credentialId,
    runId: stored.runId,
    version: stored.versions.length,
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

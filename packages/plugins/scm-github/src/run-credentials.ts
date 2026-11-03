import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { draft } from '@taskelith/plugin-sdk';
import type { InstallationToken, InstallationTokens, TokenGrant } from './installation-tokens.js';

type RunCredential = draft.RunCredential;

// The plugin's time; tests drive it with the emulated GitHub's clock.
export interface CredentialClock {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

export const SYSTEM_CLOCK: CredentialClock = Object.freeze({
  now: () => Date.now(),
  sleep: async (milliseconds: number) => { await sleep(milliseconds); },
});

const SECOND_MS = 1000;
const REFRESH_MINTS = 2;
const MAX_REFRESH_WAIT_MS = 5 * SECOND_MS;
// Past GitHub's expiry by this much, a token ends without a revocation,
// which allows for skew between the local and GitHub's clocks.
const EXPIRY_MARGIN_MS = 60 * SECOND_MS;

// A version holds its token until it ends; then only its number remains.
interface CredentialVersion {
  token: string | undefined;
  // GitHub's expiry of the token, in epoch milliseconds.
  readonly expiry: number;
}

interface RunCredentialVersion {
  readonly minted: InstallationToken;
  readonly version: number;
}

interface StoredCredential {
  readonly runId: string;
  readonly grant: TokenGrant;
  readonly versions: CredentialVersion[];
  latestExpiry: number;
  // Refreshes still waiting for GitHub, which a revocation waits for.
  readonly refreshing: Set<Promise<Result<RunCredentialVersion>>>;
  revoked: boolean;
}

// Credential versions live in this process only. After a restart every
// credential is unknown, and its tokens end at GitHub's own expiry.
export class GithubRunCredentials {
  private readonly credentials = new Map<string, StoredCredential>();

  constructor(
    private readonly tokens: InstallationTokens,
    private readonly clock: CredentialClock,
  ) {}

  async issueRunCredential(request: draft.RunCredentialRequest): Promise<Result<RunCredential>> {
    this.forgetExpired();
    const requested = { repositories: [...request.repositories], permissions: [...request.permissions] };
    const minted = await this.tokens.mint(requested);
    if (!minted.ok) return minted;
    const credentialId = randomUUID();
    const { repositories, permissions, token, expiresAt } = minted.value;
    const expiry = Date.parse(expiresAt);
    const stored: StoredCredential = {
      runId: request.runId,
      grant: { repositories, permissions },
      versions: [{ token, expiry }],
      latestExpiry: expiry,
      refreshing: new Set(),
      revoked: false,
    };
    this.credentials.set(credentialId, stored);
    return ok(runCredential(credentialId, stored, { minted: minted.value, version: 1 }));
  }

  async refreshRunCredential({ credentialId }: draft.RunCredentialReference): Promise<Result<RunCredential>> {
    this.forgetExpired();
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
    this.forgetExpired();
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
    this.forgetExpired();
    const stored = this.credentials.get(credentialId);
    if (stored === undefined) return err(unknownCredential());
    stored.revoked = true;
    await Promise.allSettled(stored.refreshing);
    const ended = await this.end(stored.versions);
    if (ended.ok) this.credentials.delete(credentialId);
    return ended;
  }

  // GitHub sets an expiry an hour after the token request, to the second,
  // so a mint in the newest version's second waits for the next one, once.
  private async nextVersion(stored: StoredCredential): Promise<Result<RunCredentialVersion>> {
    for (let mints = 1; ; mints += 1) {
      const minted = await this.tokens.mint(stored.grant);
      if (!minted.ok) return minted;
      const added = addVersion(stored, minted.value);
      if (added !== undefined) return added;
      await this.tokens.discard(minted.value.token);
      const shortfall = stored.latestExpiry - Date.parse(minted.value.expiresAt);
      if (mints === REFRESH_MINTS || shortfall >= MAX_REFRESH_WAIT_MS) return err(noLaterExpiry());
      await this.clock.sleep(shortfall + SECOND_MS);
      if (stored.revoked) return err(unknownCredential());
    }
  }

  // Versions past their expiry end without GitHub, which refuses them
  // anyway; a credential with every version ended is forgotten.
  private forgetExpired(): void {
    const ended = this.clock.now() - EXPIRY_MARGIN_MS;
    for (const [credentialId, stored] of this.credentials) {
      for (const version of stored.versions) {
        if (version.expiry <= ended) version.token = undefined;
      }
      const isEnded = stored.versions.every((version) => version.token === undefined);
      if (isEnded && stored.refreshing.size === 0) this.credentials.delete(credentialId);
    }
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

// A token minted after a revocation still joins the versions, which the
// revocation ends; one without a later expiry is left to the caller.
function addVersion(stored: StoredCredential, minted: InstallationToken): Result<RunCredentialVersion> | undefined {
  const expiry = Date.parse(minted.expiresAt);
  if (stored.revoked) {
    stored.versions.push({ token: minted.token, expiry });
    return err(unknownCredential());
  }
  if (expiry <= stored.latestExpiry) return undefined;
  stored.versions.push({ token: minted.token, expiry });
  stored.latestExpiry = expiry;
  return ok({ minted, version: stored.versions.length });
}

function noLaterExpiry() {
  return failure('unavailable', 'GitHub gave the refresh no later expiry; retry later');
}

function unknownCredential() {
  return failure('not-found', 'Unknown or revoked run credential');
}

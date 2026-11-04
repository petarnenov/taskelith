// After the repositories are reset, every token the run minted is revoked:
// the plugin's, the suite's, and the fixture's own.

export interface RevocationReport {
  readonly revoked: number;
  // GitHub answered 401: the token had already ended.
  readonly alreadyEnded: number;
  // The answer of each failed revocation, or 0 when it failed locally.
  readonly failedStatuses: readonly number[];
}

// Answers GitHub's status for `DELETE /installation/token` with the token.
export type TokenRevoker = (token: string) => Promise<number>;

export async function revokeTokens(tokens: readonly string[], revoke: TokenRevoker): Promise<RevocationReport> {
  let revoked = 0;
  let alreadyEnded = 0;
  const failedStatuses: number[] = [];
  for (const token of new Set(tokens)) {
    const status = await revoke(token).catch(() => 0);
    if (status === 204) revoked += 1;
    else if (status === 401) alreadyEnded += 1;
    else failedStatuses.push(status);
  }
  return { revoked, alreadyEnded, failedStatuses };
}

export function isRevocationClean(report: RevocationReport): boolean {
  return report.failedStatuses.length === 0;
}

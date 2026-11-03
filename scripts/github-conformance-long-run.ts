import type {
  RunCredential,
  SourceControlConformanceFinding,
  SourceControlConformanceFixture,
} from '@taskelith/integrations';

// The opt-in long-run case (source control contract section 9, item 20):
// a run refreshes and adopts its credential until it has outlived the
// original version's expiry, which GitHub sets an hour after the mint.

export const LONG_RUN_CASE = 'long-run refresh';

export interface LongRunTiming {
  readonly refreshEveryMs: number;
  // How far past the original expiry the run keeps going.
  readonly outliveByMs: number;
}

// About 62 minutes for GitHub's hour-long tokens, with four refreshes.
export const LONG_RUN_TIMING: LongRunTiming = Object.freeze({ refreshEveryMs: 20 * 60_000, outliveByMs: 2 * 60_000 });

export interface LongRunClock {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

const RUN_ID = 'conformance-long-run';
const READ_ONLY = Object.freeze(['read-code']);

export async function runLongRefresh(
  fixture: SourceControlConformanceFixture,
  timing: LongRunTiming,
  clock: LongRunClock,
): Promise<readonly SourceControlConformanceFinding[]> {
  const run = new LongRun(fixture);
  try {
    await run.outlive(timing, clock);
  } catch (error) {
    run.report('threw', `the case stopped: ${error instanceof Error ? error.message : 'a non-error value'}`);
  }
  return run.findings;
}

class LongRun {
  readonly findings: SourceControlConformanceFinding[] = [];

  private readonly fixture: SourceControlConformanceFixture;

  constructor(fixture: SourceControlConformanceFixture) {
    this.fixture = fixture;
  }

  report(check: SourceControlConformanceFinding['check'], message: string): void {
    this.findings.push(Object.freeze({ caseName: LONG_RUN_CASE, check, message }));
  }

  async outlive(timing: LongRunTiming, clock: LongRunClock): Promise<void> {
    const { provider, projectRepository } = this.fixture;
    const issued = await provider.issueRunCredential({ runId: RUN_ID, repositories: [projectRepository], permissions: [...READ_ONLY] });
    if (!issued.ok) return this.report('result', `issueRunCredential failed with ${issued.error.code}`);
    const originalExpiry = Date.parse(issued.value.expiresAt);
    let current = issued.value;
    while (clock.now() < originalExpiry + timing.outliveByMs) {
      await clock.sleep(Math.min(timing.refreshEveryMs, originalExpiry + timing.outliveByMs - clock.now()));
      const next = await this.refreshAndAdopt(current);
      if (next === undefined) return;
      current = next;
    }
    await this.expectReads(issued.value, false, 'the original version past its expiry');
    await this.expectReads(current, true, 'the latest version past the original expiry');
    const revoked = await provider.revokeRunCredential({ credentialId: current.credentialId });
    if (!revoked.ok) this.report('result', `revokeRunCredential failed with ${revoked.error.code}`);
    await this.expectReads(current, false, 'the latest version after the revocation');
  }

  // The previous secret works until the run confirms the new one.
  private async refreshAndAdopt(current: RunCredential): Promise<RunCredential | undefined> {
    const { provider } = this.fixture;
    const refreshed = await provider.refreshRunCredential({ credentialId: current.credentialId });
    if (!refreshed.ok) {
      this.report('result', `refreshRunCredential of version ${current.version} failed with ${refreshed.error.code}`);
      return undefined;
    }
    const next = refreshed.value;
    if (Date.parse(next.expiresAt) <= Date.parse(current.expiresAt)) this.report('outcome', 'a refresh gave no later expiry');
    await this.expectReads(current, true, `version ${current.version} before the adoption of ${next.version}`);
    await this.expectReads(next, true, `version ${next.version} before its adoption`);
    const adopted = await provider.confirmRunCredentialAdoption({ credentialId: next.credentialId, version: next.version });
    if (!adopted.ok) this.report('result', `confirmRunCredentialAdoption failed with ${adopted.error.code}`);
    await this.expectReads(current, false, `version ${current.version} after the adoption of ${next.version}`);
    return next;
  }

  private async expectReads(credential: RunCredential, allowed: boolean, subject: string): Promise<void> {
    const read = await this.fixture.attemptAction(credential, this.fixture.projectRepository, 'read-code');
    if (read.ok !== allowed) this.report('outcome', `${subject} ${allowed ? 'was refused a read' : 'still reads'}`);
  }
}

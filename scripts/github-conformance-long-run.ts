import type { Result } from '@taskelith/kernel';
import {
  awaitRefusal,
  type RunCredential,
  type SourceControlConformanceEnding,
  type SourceControlConformanceFinding,
  type SourceControlConformanceFixture,
} from '@taskelith/integrations';

// Opt-in (source control contract section 9): refresh and adopt until the
// run outlives the original expiry, an hour after GitHub's mint.

export const LONG_RUN_CASE = 'long-run refresh';

export interface LongRunTiming {
  readonly refreshEveryMs: number;
  // How far past the original expiry the run keeps going.
  readonly outliveByMs: number;
}

// About 62 minutes for GitHub's hour-long tokens, with four refreshes.
export const LONG_RUN_TIMING: LongRunTiming = Object.freeze({ refreshEveryMs: 20 * 60_000, outliveByMs: 2 * 60_000 });

export interface LongRunOutcome {
  readonly findings: readonly SourceControlConformanceFinding[];
  readonly endings: readonly SourceControlConformanceEnding[];
}

const RUN_ID = 'conformance-long-run';
const READ_ONLY = Object.freeze(['read-code']);

export async function runLongRefresh(fixture: SourceControlConformanceFixture, timing: LongRunTiming): Promise<LongRunOutcome> {
  const run = new LongRun(fixture);
  try {
    await run.outlive(timing);
  } catch (error) {
    run.report('threw', `the case stopped: ${error instanceof Error ? error.message : 'a non-error value'}`);
  }
  return { findings: run.findings, endings: run.endings };
}

class LongRun {
  readonly findings: SourceControlConformanceFinding[] = [];

  readonly endings: SourceControlConformanceEnding[] = [];

  private readonly fixture: SourceControlConformanceFixture;

  constructor(fixture: SourceControlConformanceFixture) {
    this.fixture = fixture;
  }

  report(check: SourceControlConformanceFinding['check'], message: string): void {
    this.findings.push(Object.freeze({ caseName: LONG_RUN_CASE, check, message }));
  }

  async outlive(timing: LongRunTiming): Promise<void> {
    const { provider, projectRepository, clock } = this.fixture;
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
    await this.expectRefused(issued.value, 'the original version past its expiry');
    await this.expectReads(current, 'the latest version past the original expiry');
    const revoked = await provider.revokeRunCredential({ credentialId: current.credentialId });
    if (!revoked.ok) this.report('result', `revokeRunCredential failed with ${revoked.error.code}`);
    await this.expectEnded(current, 'the latest version after the revocation', clock.now());
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
    await this.expectReads(current, `version ${current.version} before the adoption of ${next.version}`);
    await this.expectReads(next, `version ${next.version} before its adoption`);
    const adopted = await provider.confirmRunCredentialAdoption({ credentialId: next.credentialId, version: next.version });
    if (!adopted.ok) this.report('result', `confirmRunCredentialAdoption failed with ${adopted.error.code}`);
    const adoptedAt = this.fixture.clock.now();
    await this.expectEnded(current, `version ${current.version} after the adoption of ${next.version}`, adoptedAt);
    return next;
  }

  private async expectReads(credential: RunCredential, subject: string): Promise<void> {
    if (!(await this.read(credential)).ok) this.report('outcome', `${subject} was refused a read`);
  }

  private async expectRefused(credential: RunCredential, subject: string): Promise<void> {
    if ((await this.read(credential)).ok) this.report('outcome', `${subject} still reads`);
  }

  // Within the propagation window of the port (contract section 3).
  private async expectEnded(credential: RunCredential, subject: string, endedAt: number): Promise<void> {
    const ending = await awaitRefusal(() => this.read(credential), this.fixture.clock, endedAt);
    if (ending.result.ok) this.report('outcome', `${subject} still reads`);
    this.endings.push(Object.freeze({ caseName: LONG_RUN_CASE, when: subject, latencyMs: ending.latencyMs }));
  }

  private read(credential: RunCredential): Promise<Result<void>> {
    return this.fixture.attemptAction(credential, this.fixture.projectRepository, 'read-code');
  }
}

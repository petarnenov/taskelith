import type { Result } from '@taskelith/kernel';
import {
  awaitRefusal,
  describeThrown,
  readRunCredential,
  readUntrustedResult,
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
// Ends the case after its finding, as the shared suite's abort does.
const STOPPED = Object.freeze({ stopped: true });

export async function runLongRefresh(fixture: SourceControlConformanceFixture, timing: LongRunTiming): Promise<LongRunOutcome> {
  const run = new LongRun(fixture);
  try {
    await run.outlive(timing);
  } catch (error) {
    // The thrown value's text may hold anything, so only its kind is kept.
    if (error !== STOPPED) run.report('threw', `the case stopped: ${describeThrown(error)}`);
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
    const request = { runId: RUN_ID, repositories: [projectRepository], permissions: [...READ_ONLY] };
    const issued = await this.call('issueRunCredential', () => provider.issueRunCredential(request));
    if (!issued.ok) return this.report('result', `issueRunCredential failed with ${issued.error.code}`);
    const original = this.credential('issueRunCredential', issued.value);
    const originalExpiry = Date.parse(original.expiresAt);
    let current = original;
    while (clock.now() < originalExpiry + timing.outliveByMs) {
      await clock.sleep(Math.min(timing.refreshEveryMs, originalExpiry + timing.outliveByMs - clock.now()));
      const next = await this.refreshAndAdopt(current);
      if (next === undefined) return;
      current = next;
    }
    this.expectForbidden('the original version past its expiry', await this.read(original));
    await this.expectReads(current, 'the latest version past the original expiry');
    const revoked = await this.call('revokeRunCredential', () => provider.revokeRunCredential({ credentialId: current.credentialId }));
    if (!revoked.ok) this.report('result', `revokeRunCredential failed with ${revoked.error.code}`);
    await this.expectEnded(current, 'the latest version after the revocation', clock.now());
  }

  // The previous secret works until the run confirms the new one.
  private async refreshAndAdopt(current: RunCredential): Promise<RunCredential | undefined> {
    const { provider } = this.fixture;
    const refreshed = await this.call('refreshRunCredential', () => provider.refreshRunCredential({ credentialId: current.credentialId }));
    if (!refreshed.ok) {
      this.report('result', `refreshRunCredential of version ${current.version} failed with ${refreshed.error.code}`);
      return undefined;
    }
    const next = this.credential('refreshRunCredential', refreshed.value);
    if (Date.parse(next.expiresAt) <= Date.parse(current.expiresAt)) this.report('outcome', 'a refresh gave no later expiry');
    await this.expectReads(current, `version ${current.version} before the adoption of ${next.version}`);
    await this.expectReads(next, `version ${next.version} before its adoption`);
    const adoption = { credentialId: next.credentialId, version: next.version };
    const adopted = await this.call('confirmRunCredentialAdoption', () => provider.confirmRunCredentialAdoption(adoption));
    if (!adopted.ok) this.report('result', `confirmRunCredentialAdoption failed with ${adopted.error.code}`);
    const adoptedAt = this.fixture.clock.now();
    await this.expectEnded(current, `version ${current.version} after the adoption of ${next.version}`, adoptedAt);
    return next;
  }

  private async expectReads(credential: RunCredential, subject: string): Promise<void> {
    const result = await this.read(credential);
    if (!result.ok) this.report('outcome', `${subject} was refused a read`);
  }

  // Within the propagation window of the port (contract section 3).
  private async expectEnded(credential: RunCredential, subject: string, endedAt: number): Promise<void> {
    const ending = await awaitRefusal(() => this.read(credential), this.fixture.clock, endedAt);
    const answer: Result<unknown> = ending.refusal === undefined ? { ok: true, value: undefined } : { ok: false, error: ending.refusal };
    this.expectForbidden(subject, answer);
    this.endings.push(Object.freeze({ caseName: LONG_RUN_CASE, when: subject, latencyMs: ending.latencyMs }));
  }

  // Only GitHub's refusal of the credential counts; another failure is a
  // finding of its own.
  private expectForbidden(subject: string, result: Result<unknown>): void {
    if (result.ok) this.report('outcome', `${subject} still reads`);
    else if (result.error.code !== 'forbidden') this.report('outcome', `${subject} failed with ${result.error.code}, not forbidden`);
  }

  private credential(operation: string, value: unknown): RunCredential {
    const read = readRunCredential(value);
    if (read.ok) return read.value;
    this.report('shape', `${operation}: ${read.error.join('; ')}`);
    throw STOPPED;
  }

  private read(credential: RunCredential): Promise<Result<unknown>> {
    const { fixture } = this;
    return this.untrusted('fixture', 'attemptAction', () => fixture.attemptAction(credential, fixture.projectRepository, 'read-code'));
  }

  private call(operation: string, call: () => Promise<unknown>): Promise<Result<unknown>> {
    return this.untrusted('result', operation, call);
  }

  // A throw or a malformed result ends the case with a finding.
  private async untrusted(
    check: SourceControlConformanceFinding['check'],
    operation: string,
    call: () => Promise<unknown>,
  ): Promise<Result<unknown>> {
    let raw: unknown;
    try {
      raw = await call();
    } catch (error) {
      this.report('threw', `${operation} threw: ${describeThrown(error)}`);
      throw STOPPED;
    }
    const result = readUntrustedResult(raw);
    if (result.ok) return result.value;
    this.report(check, `${operation}: ${result.error.join('; ')}`);
    throw STOPPED;
  }
}

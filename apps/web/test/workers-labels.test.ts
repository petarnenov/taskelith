import { describe, expect, it } from 'vitest';
import type { SelfCheckResult } from '../src/workers/workers';
import { ADMISSION_LABELS, failedFirst, OUTCOME_LABELS, PLATFORM_LABELS, REASON_LABELS } from '../src/workers/workers-labels';

const results: SelfCheckResult[] = [
  { checkId: 'a-passed', outcome: 'passed', details: [] },
  { checkId: 'b-failed', outcome: 'failed', details: ['x'] },
  { checkId: 'c-skipped', outcome: 'not-applicable', details: ['no-launch-command'] },
  { checkId: 'd-failed', outcome: 'failed', details: ['y'] },
];

describe('failedFirst', () => {
  it('puts the failed checks first and keeps the wire order within each group', () => {
    expect(failedFirst(results).map((result) => result.checkId)).toEqual(['b-failed', 'd-failed', 'a-passed', 'c-skipped']);
  });

  it('leaves a list without a failed check as it is', () => {
    const passed = results.filter((result) => result.outcome !== 'failed');
    expect(failedFirst(passed)).toEqual(passed);
  });
});

describe('the labels', () => {
  it('name every admission state, platform, outcome, and reason in words', () => {
    expect(ADMISSION_LABELS).toEqual({
      'awaiting-self-check': 'Awaiting self-check',
      admitted: 'Admitted',
      'self-check-failed': 'Not admitted: self-check failed',
    });
    expect(PLATFORM_LABELS).toEqual({ linux: 'Linux', darwin: 'macOS' });
    expect(OUTCOME_LABELS).toEqual({ passed: 'passed', failed: 'failed', 'not-applicable': 'not applicable' });
    expect(REASON_LABELS).toEqual({ 'platform-not-covered': 'platform not covered', 'no-launch-command': 'no launch command' });
  });
});

import type { SelfCheckResult } from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { notApplicableReason, type StartFacts, type WorkerAdmissionCheck } from '@taskelith/fleet';
import { redactSecrets } from '@taskelith/secrets';
import { displayText } from './display-text.js';

// The wire's bounds of a report (worker admission contract section 3).
const CHECKS_MAXIMUM = 8;
const CHECK_ID = /^[a-z][a-z0-9-]{0,63}$/;
const DETAILS_MAXIMUM = 8;
const NO_PROBLEM = 'the check failed without naming a problem';

// A composition the report cannot carry whole is refused before the start,
// so no check is ever left out of a report.
export function checkComposition(checks: readonly WorkerAdmissionCheck[]): Result<void> {
  if (checks.length > CHECKS_MAXIMUM) {
    return err(failure('invalid', `at most ${CHECKS_MAXIMUM} admission checks can be composed, not ${checks.length}`));
  }
  const ids = checks.map((check) => check.checkId);
  const malformed = ids.find((checkId) => !CHECK_ID.test(checkId));
  if (malformed !== undefined) return err(failure('invalid', `admission check id ${JSON.stringify(malformed)} is malformed`));
  const repeated = ids.find((checkId, index) => ids.indexOf(checkId) !== index);
  return repeated === undefined ? ok(undefined) : err(failure('invalid', `admission check ${repeated} is composed more than once`));
}

// Runs every composed check in `checkId` order. Only the check's scope and
// this start's facts make a result not-applicable; any other run fails.
export async function runSelfCheck(checks: readonly WorkerAdmissionCheck[], facts: StartFacts): Promise<Result<readonly SelfCheckResult[]>> {
  const composed = checkComposition(checks);
  if (!composed.ok) return composed;
  const ordered = [...checks].sort((left, right) => (left.checkId < right.checkId ? -1 : left.checkId > right.checkId ? 1 : 0));
  const results: SelfCheckResult[] = [];
  for (const check of ordered) results.push(await resultOf(check, facts));
  return ok(Object.freeze(results));
}

export function hasFailedCheck(results: readonly SelfCheckResult[]): boolean {
  return results.some((result) => result.outcome === 'failed');
}

async function resultOf(check: WorkerAdmissionCheck, facts: StartFacts): Promise<SelfCheckResult> {
  const { checkId } = check;
  const reason = notApplicableReason(check.scope, facts);
  if (reason !== undefined) return Object.freeze({ checkId, outcome: 'not-applicable', details: Object.freeze([reason]) });
  try {
    const run: { readonly outcome: string; readonly problems?: unknown } = await check.run();
    if (run.outcome === 'passed') return Object.freeze({ checkId, outcome: 'passed', details: Object.freeze([]) });
    return failed(checkId, Array.isArray(run.problems) ? run.problems.map(String) : []);
  } catch (error) {
    return failed(checkId, [error instanceof Error ? error.message : String(error)]);
  }
}

// A problem may name a path or echo a secret; it is redacted and bounded
// before the journal keeps it.
function failed(checkId: string, problems: readonly string[]): SelfCheckResult {
  const details = problems.slice(0, DETAILS_MAXIMUM).map((problem) => displayText(redactSecrets(problem), NO_PROBLEM));
  return Object.freeze({ checkId, outcome: 'failed', details: Object.freeze(details.length === 0 ? [NO_PROBLEM] : details) });
}

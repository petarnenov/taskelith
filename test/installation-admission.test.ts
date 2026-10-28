import assert from 'node:assert/strict';
import test from 'node:test';
import { admissionVerdict, exitStatus, REFUSED, WAITING } from '../scripts/installation-admission.ts';

const AS_OF = '2026-10-28T10:00:05.000Z';
const CONTAINMENT = 'linux-containment';

interface Result {
  readonly checkId: string;
  readonly outcome: string;
  readonly details: readonly string[];
}

function view(admission: string, results: readonly Result[], reportedAt = '2026-10-28T10:00:01.000Z'): string {
  return JSON.stringify({
    asOf: AS_OF,
    workers: [{
      workerId: 'worker-1', host: { platform: 'linux', architecture: 'x64', hostname: 'worker' },
      enrolledAt: '2026-10-28T09:59:00.000Z', admission, reportedAt, results,
    }],
  });
}

const passed = [{ checkId: CONTAINMENT, outcome: 'passed', details: [] }];

test('an admitted worker whose containment check passed is admitted at the view time', () => {
  const verdict = admissionVerdict(view('admitted', passed), { checkId: CONTAINMENT });
  assert.deepEqual(verdict, { kind: 'admitted', asOf: AS_OF });
  assert.equal(exitStatus(verdict), 0);
});

test('a worker awaiting its self-check is waited for', () => {
  const verdict = admissionVerdict(view('awaiting-self-check', []), { checkId: CONTAINMENT });
  assert.deepEqual(verdict, { kind: 'waiting', reason: 'the worker is awaiting-self-check' });
  assert.equal(exitStatus(verdict), WAITING);
});

test('a failed self-check is refused at once with the failed check IDs and details', () => {
  const results = [
    { checkId: CONTAINMENT, outcome: 'failed', details: ['the execution account can write cgroup.procs'] },
    { checkId: 'other-check', outcome: 'passed', details: [] },
  ];
  const verdict = admissionVerdict(view('self-check-failed', results), { checkId: CONTAINMENT });
  assert.deepEqual(verdict, {
    kind: 'refused', reason: 'self-check-failed: linux-containment (the execution account can write cgroup.procs)',
  });
  assert.equal(exitStatus(verdict), REFUSED);
});

test('an admission without a run of the containment check is refused', () => {
  const skipped = [{ checkId: CONTAINMENT, outcome: 'not-applicable', details: ['no-launch-command'] }];
  assert.deepEqual(admissionVerdict(view('admitted', skipped), { checkId: CONTAINMENT }), {
    kind: 'refused', reason: 'admitted, but linux-containment is not-applicable',
  });
  assert.deepEqual(admissionVerdict(view('admitted', []), { checkId: CONTAINMENT }), {
    kind: 'refused', reason: 'admitted, but linux-containment is not reported',
  });
});

test('only a report consumed after the given time counts', () => {
  const after = '2026-10-28T10:00:01.000Z';
  for (const admission of ['admitted', 'self-check-failed']) {
    const stale = admissionVerdict(view(admission, passed), { checkId: CONTAINMENT, reportedAfter: after });
    assert.equal(stale.kind, 'waiting', admission);
  }
  const unreported = JSON.stringify({ asOf: AS_OF, workers: [{ admission: 'awaiting-self-check', results: [] }] });
  assert.equal(admissionVerdict(unreported, { checkId: CONTAINMENT, reportedAfter: after }).kind, 'waiting');
  const current = admissionVerdict(view('admitted', passed, '2026-10-28T10:00:02.000Z'), { checkId: CONTAINMENT, reportedAfter: after });
  assert.equal(current.kind, 'admitted');
});

test('an unavailable read is waited for, and any other read failure is refused', () => {
  const failure = (code: string) => JSON.stringify({ error: { code, message: 'the store is down' } });
  assert.deepEqual(admissionVerdict(failure('unavailable'), { checkId: CONTAINMENT }), {
    kind: 'waiting', reason: 'the worker admission could not be read: unavailable: the store is down',
  });
  assert.deepEqual(admissionVerdict(failure('forbidden'), { checkId: CONTAINMENT }), {
    kind: 'refused', reason: 'the worker admission could not be read: forbidden: the store is down',
  });
  assert.equal(admissionVerdict('', { checkId: CONTAINMENT }).kind, 'waiting', 'no output, as when the run fails');
});

test('output that is not the view of one worker is refused', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['not json', 'the worker admission command printed no JSON'],
    ['{"asOf":"x"}', 'the worker admission command printed no workers view'],
    ['null', 'the worker admission command printed no workers view'],
    [JSON.stringify({ asOf: AS_OF, workers: [] }), 'expected one enrolled worker, found 0'],
    [JSON.stringify({ asOf: AS_OF, workers: [{ admission: 'unknown', results: [] }] }), 'unknown worker admission unknown'],
  ];
  for (const [output, reason] of cases) {
    assert.deepEqual(admissionVerdict(output, { checkId: CONTAINMENT }), { kind: 'refused', reason }, output);
  }
});

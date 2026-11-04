import assert from 'node:assert/strict';
import test from 'node:test';
import {
  awaitRefusal,
  REVOCATION_POLL_MS,
  REVOCATION_PROPAGATION_SECONDS,
  runSourceControlConformance,
  type SourceControlConformanceFixture,
} from '@taskelith/integrations';
import { err, failure, ok } from '@taskelith/kernel';
import { defective, findings, headings } from './conformance-findings.ts';
import { InMemoryScm } from './in-memory-source-control.ts';

// Each defect of the fake service breaks one guarantee of the port.

const EXTRA_CONTEXT = 'existing/required';
const FOREIGN_REFUSAL = / to the foreign repository( [a-z ]+)? must fail with forbidden$/;

function cases(lines: readonly string[]): string[] {
  return [...new Set(headings(lines))];
}

test('a conforming provider passes every case', async () => {
  assert.deepEqual(await findings(new InMemoryScm().fixture()), []);
});

test('a conforming provider that keeps an existing required context passes', async () => {
  assert.deepEqual(await defective({}, { existingRequiredStatuses: [EXTRA_CONTEXT] }), []);
});

test('a provider that declares and supports every merge method passes', async () => {
  assert.deepEqual(await defective({}, { mergeMethods: ['merge-commit', 'squash', 'rebase'] }), []);
});

test('a protection that the provider identity can bypass is reported', async () => {
  const lines = await defective({ bypassableProtection: true });
  assert.equal(lines[0], 'merge protection outcome: ensureMergeProtection must bind the provider identity');
  assert.ok(lines.includes('required statuses bypass: the provider identity merged past taskelith/review missing'));
});

test('a read-only credential that can write is reported', async () => {
  const lines = await defective({ readOnlyCanWrite: true });
  assert.deepEqual(cases(lines), [
    'read-only credential outcome',
    'change request and status credentials outcome',
    'refreshed credential outcome',
    'credential isolation outcome',
  ]);
  assert.match(lines[0]!, /^read-only credential outcome: write-code to the project repository must fail with forbidden$/);
});

test('a credential that works for no access at all is reported', async () => {
  const lines = await defective({ unusableCredentials: true });
  assert.ok(lines.length > 0 && lines.every((line) => line.endsWith('must succeed')));
  assert.match(lines[0]!, /^read-only credential outcome: read-code to the project repository must succeed$/);
  assert.ok(lines.some((line) => /^revoked credential outcome: write-code .* must succeed$/.test(line)));
});

test('a credential not limited to the project repositories is reported', async () => {
  const lines = await defective({ unscopedCredentials: true });
  assert.ok(lines.every((line) => FOREIGN_REFUSAL.test(line)));
  assert.deepEqual(cases(lines), [
    'read-only credential outcome',
    'write credential outcome',
    'change request and status credentials outcome',
    'refreshed credential outcome',
    'revoked credential outcome',
  ]);
});

test('a refreshed credential that the service widened is reported', async () => {
  const lines = await defective({ refreshUnscopes: true });
  assert.deepEqual(headings(lines), Array(10).fill('refreshed credential outcome'));
  assert.ok(lines.every((line) => FOREIGN_REFUSAL.test(line)));
});

test('a refresh that does not extend the expiry is reported', async () => {
  const lines = await defective({ refreshKeepsExpiry: true });
  assert.deepEqual(cases(lines), ['refreshed credential outcome', 'adopted credential outcome', 'revoked credential outcome']);
  assert.ok(lines.every((line) => /refreshRunCredential must extend expiresAt beyond/.test(line)));
});

test('a refresh that returns the same secret with a later expiry is reported', async () => {
  const lines = await defective({ refreshKeepsSecret: true });
  assert.equal(lines[0], 'refreshed credential outcome: refreshRunCredential must return a new secret');
  assert.equal(lines[1], 'refreshed credential outcome: refreshRunCredential must return a new authorization');
  assert.ok(lines.includes(
    'refreshed credential outcome: write-code to the project repository after the adoption of its successor was not refused within REVOCATION_PROPAGATION_SECONDS',
  ));
});

test('a refresh that widens a credential to every permission is reported', async () => {
  assert.deepEqual(await defective({ refreshWidens: true }), [
    'refreshed credential outcome: refreshRunCredential granted write-code to a request without it',
    'refreshed credential outcome: refreshRunCredential changed the permissions',
    'adopted credential outcome: refreshRunCredential granted write-code to a request without it',
    'adopted credential outcome: refreshRunCredential changed the permissions',
  ]);
});

test('one secret shared between runs is reported', async () => {
  const lines = await defective({ sharedSecret: true });
  assert.deepEqual(cases(lines), ['credential isolation outcome']);
  assert.equal(lines[0], 'credential isolation outcome: credentials of two runs must have distinct secrets');
  assert.equal(lines[1], 'credential isolation outcome: credentials of two runs must have distinct authorizations');
  assert.match(lines[2]!, /after another run got write-code must fail with forbidden/);
  assert.match(lines[3]!, /read-code .* after another run was revoked must succeed/);
});

test('a credential that reads outside the project is reported', async () => {
  const lines = await defective({ readsOutsideProject: true });
  assert.ok(lines.length > 0);
  assert.ok(lines.every((line) => FOREIGN_REFUSAL.test(line) && line.includes(': read-code to')));
  assert.deepEqual(cases(lines), [
    'read-only credential outcome',
    'write credential outcome',
    'change request and status credentials outcome',
    'refreshed credential outcome',
    'revoked credential outcome',
  ]);
});

test('a refreshed or revoked credential that still reads is reported', async () => {
  const lines = await defective({ endedCanRead: true });
  const successor = 'read-code to the project repository after the adoption of its successor was not refused within REVOCATION_PROPAGATION_SECONDS';
  const later = 'read-code to the project repository after the adoption of a later version was not refused within REVOCATION_PROPAGATION_SECONDS';
  assert.deepEqual(lines, [
    `refreshed credential outcome: ${successor}`,
    `refreshed credential outcome: ${successor}`,
    `adopted credential outcome: ${later}`,
    `adopted credential outcome: ${later}`,
    'adopted credential outcome: read-code to the project repository after a stale adoption must fail with forbidden',
    'revoked credential outcome: read-code to the project repository after the revocation of its credential was not refused within REVOCATION_PROPAGATION_SECONDS',
    'revoked credential outcome: read-code to the project repository after its revocation was not refused within REVOCATION_PROPAGATION_SECONDS',
    'credential isolation outcome: read-code to the project repository after its revocation was not refused within REVOCATION_PROPAGATION_SECONDS',
  ]);
});

for (const permission of ['write-change-requests', 'write-statuses']) {
  test(`a provider that refuses ${permission} is reported`, async () => {
    const lines = await defective({ refusesPermission: permission });
    assert.ok(lines.length > 0 && lines.every((line) => line.endsWith('issueRunCredential failed with unavailable, expected success')));
    assert.deepEqual(cases(lines), [
      'change request and status credentials outcome',
      'refreshed credential outcome',
      'revoked credential outcome',
    ]);
  });

  test(`a credential that lists ${permission} without honouring it is reported`, async () => {
    const lines = await defective({ grantsOnPaper: permission });
    assert.ok(lines.length > 0 && lines.every((line) => line.includes(`${permission} to the project repository`) && line.endsWith('must succeed')));
    assert.deepEqual(cases(lines), [
      'change request and status credentials outcome',
      'refreshed credential outcome',
      'revoked credential outcome',
    ]);
  });
}

test('a webhook verifier that ignores the signature is reported', async () => {
  const lines = await defective({ ignoresSignature: true });
  assert.deepEqual(headings(lines), ['webhook delivery outcome', 'webhook delivery outcome', 'webhook delivery outcome']);
  assert.match(lines[0]!, /with a tampered body/);
  assert.match(lines[1]!, /with a re-serialized body succeeded/);
  assert.match(lines[2]!, /with a signature made with another secret succeeded/);
});

test('a webhook verifier that checks only header presence and canonical JSON is reported', async () => {
  assert.deepEqual(await defective({ canonicalJsonOnly: true }), [
    'webhook delivery outcome: verifyWebhookDelivery with a signature made with another secret succeeded, expected failure forbidden',
  ]);
});

test('a merge allowed while a required status blocks is reported', async () => {
  const lines = await defective({ ignoresRequiredStatuses: true });
  assert.deepEqual(cases(lines), ['required statuses outcome']);
  assert.match(lines[0]!, /merge-commit and taskelith\/review missing succeeded, expected failure precondition-failed/);
});

test('a merge that ignores one required context is reported', async () => {
  const lines = await defective({ ignoredContext: 'taskelith/verification' });
  assert.match(lines[0]!, /^required statuses outcome: mergeChangeRequest with merge-commit and taskelith\/verification missing succeeded/);
});

test('an existing required context that is not enforced is reported', async () => {
  const lines = await defective({ ignoredContext: EXTRA_CONTEXT }, { existingRequiredStatuses: [EXTRA_CONTEXT] });
  assert.deepEqual(cases(lines), ['required statuses outcome']);
  assert.match(lines[0]!, /^required statuses outcome: mergeChangeRequest with merge-commit and another required context missing succeeded/);
});

test('a merge that treats failure and error as success is reported', async () => {
  const lines = await defective({ failingStatesPass: true });
  assert.match(lines[0]!, /^required statuses outcome: mergeChangeRequest with merge-commit and taskelith\/review failure succeeded/);
});

test('a method other than the fixture method that only pending blocks is reported', async () => {
  const lines = await defective({ onlyPendingBlocksFor: 'merge-commit' });
  assert.deepEqual(cases(lines), ['required statuses outcome']);
  assert.match(lines[0]!, /^required statuses outcome: mergeChangeRequest with merge-commit and taskelith\/review missing succeeded/);
});

test('a refused merge that merged anyway is reported', async () => {
  const lines = await defective({ mergesDespiteRefusal: true });
  assert.deepEqual(cases(lines), ['required statuses outcome']);
  assert.match(lines[0]!, /after mergeChangeRequest with merge-commit and taskelith\/review missing the base branch moved$/);
  assert.match(lines[1]!, /the change request is merged, not open$/);
});

test('a protection enforced for one merge method only is reported', async () => {
  const lines = await defective({ enforcesOnlyFor: 'squash' });
  assert.deepEqual(cases(lines), ['required statuses outcome', 'stale head outcome']);
  assert.match(lines[0]!, /mergeChangeRequest with merge-commit and taskelith\/review missing succeeded/);
});

test('a merge of a stale head is reported', async () => {
  const lines = await defective({ ignoresExpectedHead: true });
  assert.deepEqual(cases(lines), ['stale head outcome']);
  assert.match(lines[0]!, /mergeChangeRequest with merge-commit and a stale expected head succeeded/);
});

test('a merge by another method than the requested one is reported', async () => {
  assert.deepEqual(await defective({ alwaysSquashes: true }), [
    'merge methods outcome: mergeChangeRequest with merge-commit merged by another method',
  ]);
});

test('a merge commit that is not the new base head is reported', async () => {
  const lines = await defective({ fabricatedMergeCommit: true });
  assert.deepEqual(headings(lines), Array(4).fill('merge methods outcome'));
  assert.match(lines[0]!, /mergeChangeRequest with merge-commit returned a mergeCommit that is not the new base head$/);
  assert.equal(lines[1], 'merge methods outcome: mergeChangeRequest with merge-commit merged by another method');
});

test('a native bypass probe that fails for another reason is a fixture finding', async () => {
  const lines = await defective({ bypassFailsWith: 'internal' });
  assert.ok(lines.length > 1 && lines.every((line) => line.includes(' fixture: attemptBypassMerge')));
  assert.ok(lines.includes('native merge control fixture: attemptBypassMerge of a passing change request failed with internal'));
});

// A service's propagation delay: an ended version still works for a while.
// The service clock is fixed; only the fixture's sleeps move it.
async function withEndingLag(lagMs: number) {
  return runSourceControlConformance(new InMemoryScm({ endingLagMs: lagMs }, { now: () => FIXED_NOW }).fixture());
}

const FIXED_NOW = Date.now();
const WINDOW_MS = REVOCATION_PROPAGATION_SECONDS * 1000;

test('a version refused within the propagation window passes, with each latency', async () => {
  const report = await withEndingLag(WINDOW_MS - 1000);
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.endings.map((ending) => ending.caseName), [
    'refreshed credential',
    'refreshed credential',
    'adopted credential',
    'adopted credential',
    'revoked credential',
    'revoked credential',
    'credential isolation',
  ]);
  assert.ok(report.endings.every((ending) => ending.latencyMs === WINDOW_MS - 1000));
});

test('a version that still works after the propagation window is reported', async () => {
  const report = await withEndingLag(WINDOW_MS + 1000);
  const lines = report.findings.map((entry) => `${entry.caseName} ${entry.check}: ${entry.message}`);
  assert.deepEqual(cases(lines), [
    'refreshed credential outcome',
    'adopted credential outcome',
    'revoked credential outcome',
    'credential isolation outcome',
  ]);
  const windowed = lines.filter((line) => !line.includes('after a stale adoption'));
  assert.ok(windowed.every((line) => line.endsWith('was not refused within REVOCATION_PROPAGATION_SECONDS')));
  const isolation = 'credential isolation outcome: read-code to the project repository after its revocation was not refused within REVOCATION_PROPAGATION_SECONDS';
  assert.ok(lines.includes(isolation));
  assert.ok(report.endings.every((ending) => ending.latencyMs === WINDOW_MS));
});

// Every refusal arrives only after the propagation window.
function refusingLate(fixture: SourceControlConformanceFixture): SourceControlConformanceFixture {
  return {
    ...fixture,
    attemptAction: async (credential, repository, permission) => {
      const result = await fixture.attemptAction(credential, repository, permission);
      if (!result.ok) await fixture.clock.sleep(WINDOW_MS + 1);
      return result;
    },
  };
}

// Every refusal of the project repository names another code.
function refusingAsMissing(fixture: SourceControlConformanceFixture): SourceControlConformanceFixture {
  return {
    ...fixture,
    attemptAction: async (credential, repository, permission) => {
      const result = await fixture.attemptAction(credential, repository, permission);
      const elsewhere = result.ok || repository !== fixture.projectRepository;
      return elsewhere ? result : err(failure('not-found', 'missing'));
    },
  };
}

test('an ended version refused only after the propagation window is reported', async () => {
  const fixture = refusingLate(new InMemoryScm({}, { now: () => FIXED_NOW }).fixture());
  const lines = await findings(fixture);
  const late = 'revoked credential outcome: read-code to the project repository'
    + ' after the revocation of its credential answered only after REVOCATION_PROPAGATION_SECONDS';
  assert.ok(lines.includes(late));
  assert.ok(lines.every((line) => !line.includes('must fail with forbidden')));
});

test('an ended version refused with another code than forbidden is reported', async () => {
  const lines = await findings(refusingAsMissing(new InMemoryScm({}, { now: () => FIXED_NOW }).fixture()));
  const revoked = 'revoked credential outcome: read-code to the project repository after its revocation must fail with forbidden';
  assert.ok(lines.includes(revoked));
  assert.ok(lines.every((line) => !line.includes('REVOCATION_PROPAGATION_SECONDS')));
});

test('a conforming provider ends every version at once', async () => {
  const report = await runSourceControlConformance(new InMemoryScm({}, { now: () => FIXED_NOW }).fixture());
  assert.equal(report.endings.length, 7);
  assert.ok(Object.isFrozen(report.endings) && report.endings.every((ending) => ending.latencyMs === 0));
});

test('the wait for a refusal stops at once on any failure, without loosening', async () => {
  let slept = 0;
  const clock = {
    now: () => slept,
    sleep: async (milliseconds: number) => {
      slept += milliseconds;
    },
    timeout: () => new Promise<void>(() => {}),
  };
  const unavailable = failure('unavailable', 'down');
  const refused = { refusal: unavailable, latencyMs: 0, answeredLate: false };
  assert.deepEqual(await awaitRefusal(async () => err(unavailable), clock, 0), refused);
  const allowed = await awaitRefusal(async () => ok(undefined), clock, 0);
  assert.equal(allowed.refusal, undefined);
  assert.equal(slept, WINDOW_MS);
  assert.equal(slept / REVOCATION_POLL_MS, REVOCATION_PROPAGATION_SECONDS);
});

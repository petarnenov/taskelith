import assert from 'node:assert/strict';
import test from 'node:test';
import { defective, findings, headings } from './conformance-findings.ts';
import { InMemoryScm } from './in-memory-source-control.ts';

// Each defect of the fake service breaks one guarantee of the port.

const EXTRA_CONTEXT = 'existing/required';

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
    'credential isolation outcome',
  ]);
  assert.match(lines[0]!, /^read-only credential outcome: write-code with credential cred-\d+ to acme\/project must fail with forbidden$/);
});

test('a credential that works for no access at all is reported', async () => {
  const lines = await defective({ unusableCredentials: true });
  assert.ok(lines.length > 0 && lines.every((line) => line.endsWith('must succeed')));
  assert.match(lines[0]!, /^read-only credential outcome: read-code with credential cred-\d+ to acme\/project must succeed$/);
  assert.ok(lines.some((line) => /^revoked credential outcome: write-code .* must succeed$/.test(line)));
});

test('a credential not limited to the project repositories is reported', async () => {
  const lines = await defective({ unscopedCredentials: true });
  assert.ok(lines.every((line) => line.endsWith('to acme/other must fail with forbidden')));
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
  assert.deepEqual(headings(lines), Array(4).fill('refreshed credential outcome'));
  assert.ok(lines.every((line) => line.endsWith('to acme/other must fail with forbidden')));
});

test('a refresh that does not extend the expiry is reported', async () => {
  const lines = await defective({ refreshKeepsExpiry: true });
  assert.deepEqual(headings(lines), ['refreshed credential outcome']);
  assert.match(lines[0]!, /refreshRunCredential must extend expiresAt beyond/);
});

test('a refresh that returns the same secret with a later expiry is reported', async () => {
  const lines = await defective({ refreshKeepsSecret: true });
  assert.equal(lines[0], 'refreshed credential outcome: refreshRunCredential must return a new secret');
  assert.match(lines[2]!, /write-code with credential cred-\d+ to acme\/project after its refresh must fail with forbidden/);
});

test('a refresh that leaves the previous secret working is reported', async () => {
  const lines = await defective({ refreshKeepsOldSecret: true });
  assert.deepEqual(headings(lines), Array(4).fill('refreshed credential outcome'));
  assert.ok(lines.every((line) => line.endsWith('after its refresh must fail with forbidden')));
});

test('one secret shared between runs is reported', async () => {
  const lines = await defective({ sharedSecret: true });
  assert.deepEqual(cases(lines), ['credential isolation outcome']);
  assert.equal(lines[0], 'credential isolation outcome: credentials of two runs must have distinct secrets');
  assert.match(lines[1]!, /after another run got write-code must fail with forbidden/);
  assert.match(lines[2]!, /read-code .* after another run was revoked must succeed/);
});

test('a credential that reads outside the project is reported', async () => {
  const lines = await defective({ readsOutsideProject: true });
  assert.ok(lines.length > 0);
  assert.ok(lines.every((line) => /: read-code with credential cred-\d+ to acme\/other must fail with forbidden$/.test(line)));
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
  assert.deepEqual(lines.map((line) => line.replace(/cred-\d+/, 'cred')), [
    'refreshed credential outcome: read-code with credential cred to acme/project after its refresh must fail with forbidden',
    'revoked credential outcome: read-code with credential cred to acme/project after its revocation must fail with forbidden',
    'credential isolation outcome: read-code with credential cred to acme/project after its revocation must fail with forbidden',
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
    assert.ok(lines.length > 0 && lines.every((line) => line.includes(`${permission} with credential`) && line.endsWith('must succeed')));
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
  assert.match(lines[0]!, /^required statuses outcome: mergeChangeRequest with merge-commit and existing\/required missing succeeded/);
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
  assert.match(lines[0]!, /after mergeChangeRequest with merge-commit and taskelith\/review missing main moved from/);
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
    'merge methods outcome: mergeChangeRequest with merge-commit merged by squash',
  ]);
});

test('a merge commit that is not the new base head is reported', async () => {
  const lines = await defective({ fabricatedMergeCommit: true });
  assert.deepEqual(headings(lines), Array(4).fill('merge methods outcome'));
  assert.match(lines[0]!, /mergeChangeRequest with merge-commit returned mergeCommit nonexistent, not the base head c\d+/);
  assert.equal(lines[1], 'merge methods outcome: mergeChangeRequest with merge-commit merged by none');
});

test('a native bypass probe that fails for another reason is a fixture finding', async () => {
  const lines = await defective({ bypassFailsWith: 'internal' });
  assert.ok(lines.length > 1 && lines.every((line) => line.includes(' fixture: attemptBypassMerge')));
  assert.ok(lines.includes('native merge control fixture: attemptBypassMerge of a passing change request failed with internal'));
});

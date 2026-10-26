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
  assert.ok(lines.includes('merge method protection bypass: the provider identity merged past taskelith/review pending'));
});

test('a read-only credential that can write is reported', async () => {
  const lines = await defective({ readOnlyCanWrite: true });
  assert.deepEqual(headings(lines), ['read-only credential outcome', 'credential isolation outcome']);
  assert.match(lines[0]!, /attemptWrite with credential cred-\d+ to acme\/project must fail with forbidden/);
});

test('a credential that works for no access at all is reported', async () => {
  const lines = await defective({ unusableCredentials: true });
  assert.ok(lines.length > 0 && lines.every((line) => line.endsWith('must succeed')));
  assert.match(lines[0]!, /^read-only credential outcome: attemptRead with credential cred-\d+ to acme\/project must succeed$/);
  assert.ok(lines.some((line) => /^revoked credential outcome: attemptWrite .* must succeed$/.test(line)));
});

test('a credential not limited to the project repositories is reported', async () => {
  const lines = await defective({ unscopedCredentials: true });
  assert.deepEqual(headings(lines), ['write credential outcome', 'refreshed credential outcome']);
  assert.match(lines[0]!, /to acme\/other must fail with forbidden/);
});

test('a refreshed credential that the service widened is reported', async () => {
  const lines = await defective({ refreshUnscopes: true });
  assert.deepEqual(headings(lines), ['refreshed credential outcome']);
  assert.match(lines[0]!, /to acme\/other must fail with forbidden/);
});

test('a refresh that does not extend the expiry is reported', async () => {
  const lines = await defective({ refreshKeepsExpiry: true });
  assert.deepEqual(headings(lines), ['refreshed credential outcome']);
  assert.match(lines[0]!, /refreshRunCredential must extend expiresAt beyond/);
});

test('a refresh that returns the same secret with a later expiry is reported', async () => {
  const lines = await defective({ refreshKeepsSecret: true });
  assert.equal(lines[0], 'refreshed credential outcome: refreshRunCredential must return a new secret');
  assert.match(lines[1]!, /attemptWrite with credential cred-\d+ to acme\/project after its refresh must fail with forbidden/);
});

test('a refresh that leaves the previous secret working is reported', async () => {
  const lines = await defective({ refreshKeepsOldSecret: true });
  assert.deepEqual(headings(lines), ['refreshed credential outcome']);
  assert.match(lines[0]!, /after its refresh must fail with forbidden/);
});

test('one secret shared between runs is reported', async () => {
  const lines = await defective({ sharedSecret: true });
  assert.deepEqual(cases(lines), ['credential isolation outcome']);
  assert.equal(lines[0], 'credential isolation outcome: credentials of two runs must have distinct secrets');
  assert.match(lines[1]!, /after another run got write-code must fail with forbidden/);
  assert.match(lines[2]!, /attemptRead .* after another run was revoked must succeed/);
});

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
  assert.deepEqual(cases(lines), ['required statuses outcome', 'merge method protection outcome']);
  assert.match(lines[0]!, /squash and taskelith\/review missing succeeded, expected failure precondition-failed/);
});

test('a merge that ignores one required context is reported', async () => {
  const lines = await defective({ ignoredContext: 'taskelith/verification' });
  assert.match(lines[0]!, /^required statuses outcome: mergeChangeRequest with squash and taskelith\/verification missing succeeded/);
});

test('an existing required context that is not enforced is reported', async () => {
  const lines = await defective({ ignoredContext: EXTRA_CONTEXT }, { existingRequiredStatuses: [EXTRA_CONTEXT] });
  assert.deepEqual(cases(lines), ['required statuses outcome', 'merge method protection outcome']);
  assert.match(lines[0]!, /^required statuses outcome: mergeChangeRequest with squash and existing\/required missing succeeded/);
});

test('a merge that treats failure and error as success is reported', async () => {
  const lines = await defective({ failingStatesPass: true });
  assert.match(lines[0]!, /^required statuses outcome: mergeChangeRequest with squash and taskelith\/review failure succeeded/);
});

test('a refused merge that merged anyway is reported', async () => {
  const lines = await defective({ mergesDespiteRefusal: true });
  assert.deepEqual(cases(lines), ['required statuses outcome', 'merge method protection outcome']);
  assert.match(lines[0]!, /after mergeChangeRequest with squash and taskelith\/review missing main moved from/);
  assert.match(lines[1]!, /the change request is merged, not open$/);
});

test('a protection enforced for one merge method only is reported', async () => {
  const lines = await defective({ enforcesOnlyFor: 'squash' });
  assert.deepEqual(cases(lines), ['merge method protection outcome']);
  assert.match(lines[0]!, /mergeChangeRequest with merge-commit and taskelith\/review pending succeeded/);
});

test('a merge of a stale head is reported', async () => {
  const lines = await defective({ ignoresExpectedHead: true });
  assert.deepEqual(cases(lines), ['merge method protection outcome']);
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

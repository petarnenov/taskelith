import assert from 'node:assert/strict';
import test from 'node:test';
import { defective, findings, headings } from './conformance-findings.ts';
import { InMemoryScm } from './in-memory-source-control.ts';

// Each defect of the fake service breaks one guarantee of the port.

test('a conforming provider passes every case', async () => {
  assert.deepEqual(await findings(new InMemoryScm().fixture()), []);
});

test('a conforming provider that keeps an existing required context passes', async () => {
  assert.deepEqual(await defective({}, { existingRequiredStatuses: ['existing/required'] }), []);
});

test('a provider that declares and supports every merge method passes', async () => {
  assert.deepEqual(await defective({}, { mergeMethods: ['merge-commit', 'squash', 'rebase'] }), []);
});

test('a protection that the provider identity can bypass is reported', async () => {
  const lines = await defective({ bypassableProtection: true });
  assert.deepEqual(headings(lines).slice(0, 2), ['merge protection outcome', 'required statuses bypass']);
  assert.ok(lines.includes('required statuses bypass: the provider identity merged past taskelith/review missing'));
});

test('a read-only credential that can write is reported', async () => {
  const lines = await defective({ readOnlyCanWrite: true });
  assert.deepEqual(headings(lines), ['read-only credential outcome']);
  assert.match(lines[0]!, /writing to acme\/project must fail with forbidden/);
});

test('a credential not limited to the project repositories is reported', async () => {
  const lines = await defective({ unscopedCredentials: true });
  assert.deepEqual(headings(lines), ['write credential outcome', 'refreshed credential outcome']);
  assert.match(lines[0]!, /writing to acme\/other must fail with forbidden/);
});

test('a refreshed credential that the service widened is reported', async () => {
  const lines = await defective({ refreshUnscopes: true });
  assert.deepEqual(headings(lines), ['refreshed credential outcome']);
  assert.match(lines[0]!, /writing to acme\/other must fail with forbidden/);
});

test('a refresh that does not extend the expiry is reported', async () => {
  const lines = await defective({ refreshKeepsExpiry: true });
  assert.deepEqual(headings(lines), ['refreshed credential outcome']);
  assert.match(lines[0]!, /refreshRunCredential must extend expiresAt beyond/);
});

test('a credential that cannot write before its revocation is reported', async () => {
  const lines = await defective({ unusableCredentials: true });
  assert.deepEqual(headings(lines), ['write credential outcome', 'refreshed credential outcome', 'revoked credential outcome']);
  assert.match(lines[2]!, /could not write to acme\/project/);
});

test('a webhook verifier that accepts tampered or re-serialized bodies is reported', async () => {
  const lines = await defective({ ignoresSignature: true });
  assert.deepEqual(headings(lines), ['webhook delivery outcome', 'webhook delivery outcome']);
  assert.match(lines[0]!, /with a tampered body/);
  assert.match(lines[1]!, /with a re-serialized body succeeded/);
});

test('a merge allowed while a required status blocks is reported', async () => {
  const lines = await defective({ ignoresRequiredStatuses: true });
  assert.deepEqual(headings(lines), ['required statuses outcome', 'required statuses outcome', 'required statuses outcome']);
  assert.match(lines[0]!, /taskelith\/review missing succeeded, expected failure precondition-failed/);
});

test('a merge that ignores one required context is reported', async () => {
  const lines = await defective({ ignoredContext: 'taskelith/verification' });
  assert.match(lines[0]!, /^required statuses outcome: mergeChangeRequest with taskelith\/verification missing succeeded/);
});

test('a merge that treats failure and error as success is reported', async () => {
  const lines = await defective({ failingStatesPass: true });
  assert.match(lines[0]!, /^required statuses outcome: mergeChangeRequest with taskelith\/review failure succeeded/);
});

test('a refused merge that merged anyway is reported', async () => {
  const lines = await defective({ mergesDespiteRefusal: true });
  assert.deepEqual(headings(lines), ['required statuses outcome', 'required statuses outcome']);
  assert.match(lines[0]!, /after mergeChangeRequest with taskelith\/review missing main moved from/);
  assert.match(lines[1]!, /the change request is merged, not open$/);
});

test('a merge of a stale head is reported', async () => {
  const lines = await defective({ ignoresExpectedHead: true });
  assert.deepEqual(headings(lines), ['stale head outcome', 'stale head outcome', 'stale head outcome']);
});

test('a native bypass probe that fails for another reason is a fixture finding', async () => {
  const lines = await defective({ bypassFailsWith: 'internal' });
  assert.equal(lines.length, 9);
  assert.ok(lines.every((line) => line.includes(' fixture: attemptBypassMerge')));
  assert.equal(lines[8], 'native merge control fixture: attemptBypassMerge of a passing change request failed with internal');
});

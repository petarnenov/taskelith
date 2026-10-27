import assert from 'node:assert/strict';
import test from 'node:test';
import { err, ok } from '@taskelith/kernel';
import { findings, issued, patched } from './conformance-findings.ts';
import { InMemoryScm } from './in-memory-source-control.ts';

// Findings carry no raw payload of a thrown value or a malformed result, so
// a secret in either never reaches the conformance report.

const SECRET = 'scm-secret-7f3a9c';

class SecretError extends Error {
  override readonly name = SECRET;
}

function throwSecret(): never {
  throw new Error(SECRET);
}

function assertNoSecret(lines: readonly string[]): void {
  assert.ok(lines.length > 0, 'the defect must be reported');
  assert.deepEqual(lines.filter((line) => line.includes(SECRET)), []);
}

test('a plugin exception is reported without its payload', async () => {
  const thrown = await patched(() => ({ readChangeRequest: async () => throwSecret() }));
  assertNoSecret(thrown);
  assert.match(thrown[0]!, /^change request threw: readChangeRequest threw instead of returning a Result: an Error$/);
});

test('a plugin exception of another class is reported without its name', async () => {
  const lines = await patched(() => ({ readChangeRequest: async () => { throw new SecretError('x'); } }));
  assertNoSecret(lines);
  assert.match(lines[0]!, /threw instead of returning a Result: an Error of another class$/);
});

test('a thrown value that is not an Error is reported without its payload', async () => {
  const value = await patched(() => ({ readChangeRequest: async () => { throw { token: SECRET }; } }));
  assertNoSecret(value);
  assert.match(value[0]!, /threw instead of returning a Result: a value that is not an Error$/);
  const opaque = new Proxy({}, { getPrototypeOf: throwSecret });
  const proxy = await patched(() => ({ readChangeRequest: async () => { throw opaque; } }));
  assertNoSecret(proxy);
  assert.match(proxy[0]!, /threw instead of returning a Result: a value that is not an Error$/);
});

test('a fixture exception is reported without its payload', async () => {
  const lines = await findings({ ...new InMemoryScm().fixture(), prepareHeadBranch: async () => throwSecret() });
  assertNoSecret(lines);
  assert.ok(lines.includes('change request fixture: prepareHeadBranch threw: an Error'));
});

test('a throwing fixture property stops the case without its payload', async () => {
  const fixture = Object.defineProperty({ ...new InMemoryScm().fixture() }, 'foreignRepository', { get: throwSecret });
  const lines = await findings(fixture);
  assertNoSecret(lines);
  assert.ok(lines.includes('read-only credential threw: the case stopped: an Error'));
});

test('a throwing getter on a returned value is reported without its payload', async () => {
  const lines = await patched((provider) => ({
    issueRunCredential: async (request) => {
      const credential = await issued(provider, request);
      return ok(Object.defineProperty({ ...credential }, 'secret', { get: throwSecret }));
    },
  }));
  assertNoSecret(lines);
  assert.match(lines[0]!, /^read-only credential shape: issueRunCredential: credential could not be read: an Error$/);
});

test('a throwing capabilities getter is reported without its payload', async () => {
  const scm = new InMemoryScm();
  const provider = Object.defineProperty({ ...scm.provider() }, 'capabilities', { get: throwSecret });
  const capabilities = await findings(scm.fixture(provider));
  assertNoSecret(capabilities);
  assert.equal(capabilities[0], 'capabilities threw: capabilities could not be read: an Error');
});

test('an unknown failure code is reported without its value', async () => {
  const code = await patched(() => ({ revokeRunCredential: async () => err({ code: SECRET, message: SECRET, details: {} }) as never }));
  assertNoSecret(code);
  assert.equal(code[0], 'revoked credential result: revokeRunCredential: result.error.code is not a kernel failure code');
});

test('a throwing failure details getter is reported without its payload', async () => {
  const details = await patched(() => ({
    revokeRunCredential: async () => err({ code: 'internal', message: 'no', details: { get reason() { return throwSecret(); } } }) as never,
  }));
  assertNoSecret(details);
  assert.equal(details[0], 'revoked credential result: revokeRunCredential: result.error.details could not be read: an Error');
});

test('a throwing result value getter is reported without its payload', async () => {
  const value = await patched(() => ({ revokeRunCredential: async () => ({ ok: true, get value() { return throwSecret(); } }) as never }));
  assertNoSecret(value);
  assert.equal(value[0], 'revoked credential result: revokeRunCredential: result.value could not be read: an Error');
});

// Outcome findings name a field and the mismatch, never a plugin or
// fixture value, so a secret placed in a returned field stays out too.

test('a secret in credential fields is not in the outcome findings', async () => {
  const lines = await patched((provider) => ({
    issueRunCredential: async (request) => ok({
      ...(await issued(provider, request)),
      runId: SECRET,
      repositories: [SECRET],
      permissions: ['read-code', SECRET],
      expiresAt: SECRET,
    }),
  }));
  assertNoSecret(lines);
  assert.ok(lines.includes('read-only credential outcome: issueRunCredential returned another runId than requested'));
  assert.ok(lines.includes('read-only credential outcome: issueRunCredential returned an expiresAt that is not a canonical future instant'));
});

test('a secret in capabilities and protection is not in the findings', async () => {
  const capabilities = await patched(() => ({ capabilities: { mergeMethods: [SECRET], reviewEvidence: [SECRET] } }));
  assertNoSecret(capabilities);
  const protection = await patched((provider) => ({
    ensureMergeProtection: async (request) => {
      const ensured = await provider.ensureMergeProtection(request);
      return ensured.ok ? ok({ ...ensured.value, repository: SECRET, branch: SECRET, requiredStatuses: [SECRET] }) : ensured;
    },
  }));
  assertNoSecret(protection);
});

test('a secret in change request, status, and merge fields is not in the findings', async () => {
  const lines = await patched((provider) => ({
    openChangeRequest: async (request) => {
      const opened = await provider.openChangeRequest(request);
      return opened.ok ? ok({ ...opened.value, headBranch: SECRET, headCommit: SECRET }) : opened;
    },
    readChangeRequest: async (request) => {
      const read = await provider.readChangeRequest(request);
      return read.ok ? ok({ ...read.value, id: SECRET, repository: SECRET, headCommit: SECRET }) : read;
    },
    setCommitStatus: async (request) => {
      const status = await provider.setCommitStatus(request);
      return status.ok ? ok({ ...status.value, commit: SECRET, context: SECRET }) : status;
    },
    mergeChangeRequest: async (request) => {
      const merged = await provider.mergeChangeRequest(request);
      return merged.ok ? ok({ changeRequest: SECRET, mergeCommit: SECRET, method: SECRET }) : merged;
    },
  }));
  assertNoSecret(lines);
});

test('a secret in webhook events is not in the findings', async () => {
  const lines = await patched((provider) => ({
    verifyWebhookDelivery: async (delivery) => {
      const verified = await provider.verifyWebhookDelivery(delivery);
      return verified.ok ? ok({ ...verified.value, deliveryId: SECRET, repository: SECRET, changeRequest: SECRET }) : verified;
    },
  }));
  assertNoSecret(lines);
  assert.ok(lines.includes('webhook delivery outcome: two deliveries must have distinct deliveryIds'));
});

test('a secret in fixture values is not in the findings', async () => {
  const scm = new InMemoryScm();
  const fixture = scm.fixture();
  assertNoSecret(await findings({ ...fixture, signatureHeader: SECRET }));
  assertNoSecret(await findings({ ...fixture, mergeMethod: SECRET }));
  assertNoSecret(await findings({ ...fixture, observeMergeMethod: async () => SECRET }));
  assertNoSecret(await findings({ ...fixture, readBranchHead: async () => SECRET }));
  const prepared = await findings({
    ...fixture,
    prepareHeadBranch: async () => ({ ...(await fixture.prepareHeadBranch()), commit: SECRET }),
  });
  assertNoSecret(prepared);
});

test('a malformed fixture Result is reported by field only', async () => {
  const fixture = new InMemoryScm().fixture();
  const code = await findings({ ...fixture, attemptBypassMerge: async () => err({ code: SECRET, message: SECRET, details: {} }) as never });
  assertNoSecret(code);
  assert.ok(code.includes('native merge control fixture: attemptBypassMerge: result.error.code is not a kernel failure code'));
  const getter = { ok: false, error: { get code() { return throwSecret(); }, message: 'no', details: {} } };
  const thrown = await findings({ ...fixture, attemptBypassMerge: async () => getter as never });
  assertNoSecret(thrown);
  assert.ok(thrown.includes('native merge control fixture: attemptBypassMerge: result.error could not be read: an Error'));
  const printable = { ok: false, error: { code: { toString: () => SECRET }, message: 'no', details: {} } };
  const object = await findings({ ...fixture, attemptBypassMerge: async () => printable as never });
  assertNoSecret(object);
  assert.ok(object.includes('native merge control fixture: attemptBypassMerge: result.error.code must be a string'));
  const action = await findings({ ...fixture, attemptAction: async () => err({ code: SECRET, message: 'no', details: {} }) as never });
  assertNoSecret(action);
  assert.ok(action.includes('read-only credential fixture: attemptAction: result.error.code is not a kernel failure code'));
});

test('a Proxy thrown from a fixture getter stops only its case', async () => {
  const opaque = new Proxy({}, { getPrototypeOf: throwSecret });
  const fixture = Object.defineProperty({ ...new InMemoryScm().fixture() }, 'foreignRepository', {
    get: () => { throw opaque; },
  });
  const lines = await findings(fixture);
  assertNoSecret(lines);
  assert.ok(lines.includes('read-only credential threw: the case stopped: a value that is not an Error'));
});

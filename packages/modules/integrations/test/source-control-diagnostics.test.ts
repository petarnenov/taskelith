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

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { ControlPlaneNamespace, SESSION_INPUT_DIGEST_KEY_FILE, SessionInputDigestKeyFile } from '@taskelith/control-plane-store';
import { failed, value } from '@taskelith/testing';

const ownerUid = process.getuid!();
let base: string;

function keyFile(): { file: SessionInputDigestKeyFile; path: string } {
  base = mkdtempSync(join(tmpdir(), 'taskelith-digest-key-'));
  const namespace = value(ControlPlaneNamespace.open({ dataRoot: join(base, 'root'), ownerUid }));
  return { file: new SessionInputDigestKeyFile(namespace), path: join(namespace.directory, SESSION_INPUT_DIGEST_KEY_FILE) };
}

afterEach(() => rmSync(base, { recursive: true, force: true }));

test('the session input digest key is created once, owner-only, with 32 random bytes that read back', () => {
  const { file, path } = keyFile();
  value(file.create());
  assert.equal(statSync(path).mode & 0o777, 0o600);
  const key = value(file.read());
  assert.equal(key.length, 32);
  assert.equal(failed(file.create()).code, 'conflict');
  assert.deepEqual(value(file.read()), key);
});

test('a missing key file is refused with precondition-failed', () => {
  const { file } = keyFile();
  const refused = failed(file.read());
  assert.equal(refused.code, 'precondition-failed');
  assert.match(refused.message, /session-input-digest\.key is missing/);
});

test('a key file whose key is not base64 is refused without its content in the reason', () => {
  const { file, path } = keyFile();
  writeFileSync(path, JSON.stringify({ format: 1, key: 'not*base64*sentinel' }), { mode: 0o600 });
  const refused = failed(file.read());
  assert.equal(refused.code, 'precondition-failed');
  assert.equal(JSON.stringify(refused).includes('sentinel'), false);
  assert.equal(readFileSync(path, 'utf8').includes('sentinel'), true);
});

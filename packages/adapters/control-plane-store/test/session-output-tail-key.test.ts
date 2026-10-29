import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { ControlPlaneNamespace, SESSION_OUTPUT_TAIL_KEY_FILE, SessionOutputTailKeyFile } from '@taskelith/control-plane-store';
import { failed, value } from '@taskelith/testing';

const ownerUid = process.getuid!();
let base: string;

function keyFile(): { file: SessionOutputTailKeyFile; path: string } {
  base = mkdtempSync(join(tmpdir(), 'taskelith-tail-key-'));
  const namespace = value(ControlPlaneNamespace.open({ dataRoot: join(base, 'root'), ownerUid }));
  return { file: new SessionOutputTailKeyFile(namespace), path: join(namespace.directory, SESSION_OUTPUT_TAIL_KEY_FILE) };
}

afterEach(() => rmSync(base, { recursive: true, force: true }));

test('ensuring the output tail key creates 32 random bytes owner-only when missing, and keeps them on every later call', () => {
  const { file, path } = keyFile();
  value(file.ensure());
  assert.equal(statSync(path).mode & 0o777, 0o600);
  const created = readFileSync(path);
  value(file.ensure());
  assert.deepEqual(readFileSync(path), created);
  assert.equal(value(file.read()).length, 32);
});

test('a missing output tail key is refused, naming init', () => {
  const refused = failed(keyFile().file.read());
  assert.deepEqual([refused.code, refused.message], ['precondition-failed', 'session-output-tail.key is missing; run init']);
});

test('ensuring the output tail key keeps an existing key of the wrong size, which reads back as stored', () => {
  const { file, path } = keyFile();
  const stored = JSON.stringify({ format: 1, key: Buffer.from('short-key').toString('base64') });
  writeFileSync(path, stored, { mode: 0o600 });
  value(file.ensure());
  assert.equal(readFileSync(path, 'utf8'), stored);
  assert.equal(value(file.read()).length, 9);
});

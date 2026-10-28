import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { ControlPlaneNamespace, SLOT_CREDENTIAL_KEY_FILE, openSlotCredentialKey } from '@taskelith/control-plane-store';
import { failed, value } from '@taskelith/testing';

const ownerUid = process.getuid!();
let base: string;

function namespace(): ControlPlaneNamespace {
  base = mkdtempSync(join(tmpdir(), 'taskelith-slot-key-'));
  return value(ControlPlaneNamespace.open({ dataRoot: join(base, 'root'), ownerUid }));
}

afterEach(() => rmSync(base, { recursive: true, force: true }));

const keyPath = (opened: ControlPlaneNamespace) => join(opened.directory, SLOT_CREDENTIAL_KEY_FILE);

test('the slot credential key is created once, owner-only, and read back unchanged', () => {
  const opened = namespace();
  let generated = 0;
  const generate = () => {
    generated++;
    return new Uint8Array(32).fill(generated);
  };
  const first = value(openSlotCredentialKey(opened, generate));
  assert.deepEqual([...first], new Array(32).fill(1));
  assert.equal(statSync(keyPath(opened)).mode & 0o777, 0o600);
  assert.deepEqual(value(openSlotCredentialKey(opened, generate)), first);
  assert.equal(generated, 1);
  assert.equal(openSlotCredentialKey(opened).ok, true);
});

test('a key that another process created first is the one used', () => {
  const opened = namespace();
  const winner = Buffer.alloc(32, 9);
  const created = openSlotCredentialKey(opened, () => {
    value(opened.create(SLOT_CREDENTIAL_KEY_FILE, { key: winner.toString('base64') }));
    return new Uint8Array(32);
  });
  assert.deepEqual(Buffer.from(value(created)), winner);
});

test('a malformed key file is refused without its content', () => {
  const secretLooking = Buffer.alloc(16, 5).toString('base64');
  for (const content of [{ key: secretLooking }, { key: 7 }, { key: `${Buffer.alloc(32, 5).toString('base64')}x` }]) {
    const opened = namespace();
    writeFileSync(keyPath(opened), `${JSON.stringify({ format: 1, ...content })}\n`, { mode: 0o600 });
    const refused = failed(openSlotCredentialKey(opened));
    assert.equal(refused.code, 'precondition-failed');
    assert.ok(!JSON.stringify(refused).includes(String(content.key)), JSON.stringify(refused));
    assert.ok(readFileSync(keyPath(opened), 'utf8').includes(String(content.key)), 'the file is left as it was');
    rmSync(base, { recursive: true, force: true });
  }
  namespace();
});

test('a key file readable by others is refused', () => {
  const opened = namespace();
  value(openSlotCredentialKey(opened));
  chmodSync(keyPath(opened), 0o644);
  assert.equal(openSlotCredentialKey(opened).ok, false);
});

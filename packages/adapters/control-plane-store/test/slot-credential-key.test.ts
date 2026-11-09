import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { ControlPlaneNamespace, SLOT_CREDENTIAL_KEY_FILE, SlotCredentialKeyFile } from '@taskelith/control-plane-store';
import { failed, value } from '@taskelith/testing';

const ownerUid = process.getuid!();
let base: string;

function namespace(): ControlPlaneNamespace {
  base = mkdtempSync(join(tmpdir(), 'taskelith-slot-key-'));
  return value(ControlPlaneNamespace.open({ dataRoot: join(base, 'root'), ownerUid }));
}

afterEach(() => rmSync(base, { recursive: true, force: true }));

const keyPath = (opened: ControlPlaneNamespace) => join(opened.directory, SLOT_CREDENTIAL_KEY_FILE);

test('the slot credential key is ensured once, owner-only, and read back unchanged', () => {
  const opened = namespace();
  const file = new SlotCredentialKeyFile(opened);
  value(file.ensure());
  assert.equal(statSync(keyPath(opened)).mode & 0o777, 0o600);
  const first = value(file.read());
  assert.equal(first.length, 32);
  value(file.ensure());
  assert.deepEqual(value(new SlotCredentialKeyFile(opened).read()), first, 'a rerun keeps the key');
});

test('a missing slot credential key is refused, names init, and is not created by the read', () => {
  const opened = namespace();
  const refused = failed(new SlotCredentialKeyFile(opened).read());
  assert.deepEqual([refused.code, refused.message], ['precondition-failed', 'slot-credential-key is missing; run init']);
  assert.equal(existsSync(keyPath(opened)), false);
});

test('a slot credential key that is not 32 bytes or not base64 is refused without its content', () => {
  for (const content of [{ key: Buffer.alloc(16, 5).toString('base64') }, { key: 7 }, { key: `${Buffer.alloc(32, 5).toString('base64')}x` }]) {
    const opened = namespace();
    writeFileSync(keyPath(opened), `${JSON.stringify({ format: 1, ...content })}\n`, { mode: 0o600 });
    const refused = failed(new SlotCredentialKeyFile(opened).read());
    assert.equal(refused.code, 'precondition-failed');
    assert.ok(refused.message.startsWith(`${SLOT_CREDENTIAL_KEY_FILE} `), refused.message);
    assert.ok(!JSON.stringify(refused).includes(String(content.key)), 'the reason holds no key text');
    assert.ok(readFileSync(keyPath(opened), 'utf8').includes(String(content.key)), 'the file is left as it was');
    rmSync(base, { recursive: true, force: true });
  }
  namespace();
});

test('a short key names its size', () => {
  const opened = namespace();
  writeFileSync(keyPath(opened), JSON.stringify({ format: 1, key: Buffer.alloc(16, 5).toString('base64') }), { mode: 0o600 });
  assert.equal(failed(new SlotCredentialKeyFile(opened).read()).message, 'slot-credential-key has 16 bytes, not 32');
});

test('a key file readable by others is refused', () => {
  const opened = namespace();
  value(new SlotCredentialKeyFile(opened).ensure());
  chmodSync(keyPath(opened), 0o644);
  assert.equal(new SlotCredentialKeyFile(opened).read().ok, false);
});

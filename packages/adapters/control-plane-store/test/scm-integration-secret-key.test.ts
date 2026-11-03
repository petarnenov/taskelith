import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import {
  ControlPlaneNamespace,
  SCM_INTEGRATION_SECRET_KEY_FILE,
  SLOT_CREDENTIAL_KEY_FILE,
  ScmIntegrationSecretKeyFile,
} from '@taskelith/control-plane-store';
import { failed, value } from '@taskelith/testing';

const ownerUid = process.getuid!();
let base: string;

function keyFile(): { file: ScmIntegrationSecretKeyFile; path: string } {
  base = mkdtempSync(join(tmpdir(), 'taskelith-scm-key-'));
  const namespace = value(ControlPlaneNamespace.open({ dataRoot: join(base, 'root'), ownerUid }));
  return { file: new ScmIntegrationSecretKeyFile(namespace), path: join(namespace.directory, SCM_INTEGRATION_SECRET_KEY_FILE) };
}

afterEach(() => rmSync(base, { recursive: true, force: true }));

test('ensuring the SCM secret key creates 32 random bytes owner-only in its own file, and keeps them', () => {
  const { file, path } = keyFile();
  assert.notEqual(SCM_INTEGRATION_SECRET_KEY_FILE, SLOT_CREDENTIAL_KEY_FILE);
  value(file.ensure());
  assert.equal(statSync(path).mode & 0o777, 0o600);
  const created = readFileSync(path);
  value(file.ensure());
  assert.deepEqual(readFileSync(path), created);
  assert.equal(value(file.read()).length, 32);
});

test('a missing SCM secret key is refused, naming init', () => {
  const refused = failed(keyFile().file.read());
  assert.deepEqual([refused.code, refused.message], ['precondition-failed', 'scm-integration-secrets.key is missing; run init']);
});

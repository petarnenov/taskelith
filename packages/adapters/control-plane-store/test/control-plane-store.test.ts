import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { ControlPlaneNamespace, FileInstallationRecord } from '@taskelith/control-plane-store';
import { installationIdentity } from '@taskelith/fleet';
import { failed, value } from '@taskelith/testing';

const ownerUid = process.getuid!();
let base: string;

function dataRoot(): string {
  base = mkdtempSync(join(tmpdir(), 'taskelith-control-plane-'));
  return join(base, 'root');
}

afterEach(() => rmSync(base, { recursive: true, force: true }));

const mode = (path: string) => statSync(path).mode & 0o777;

test('the namespace is private, and a document is created once and read back', () => {
  const root = dataRoot();
  const namespace = value(ControlPlaneNamespace.open({ dataRoot: root, ownerUid }));
  assert.deepEqual([mode(root), mode(namespace.directory)], [0o700, 0o700]);
  assert.equal(value(namespace.read('broker-authority')), undefined);

  value(namespace.create('broker-authority', { accountSeed: 'SA' }));
  assert.equal(mode(join(namespace.directory, 'broker-authority')), 0o600);
  assert.equal(failed(namespace.create('broker-authority', { accountSeed: 'other' })).code, 'conflict');
  assert.deepEqual(value(namespace.read('broker-authority')), { format: 1, accountSeed: 'SA' });
  const path = value(namespace.writeText('nats-authority.conf', 'operator: x\n'));
  assert.equal(readFileSync(path, 'utf8'), 'operator: x\n');
  assert.equal(failed(namespace.read('../escape')).code, 'invalid');
  assert.ok(value(ControlPlaneNamespace.open({ dataRoot: root, ownerUid })), 'an existing namespace opens again');
});

test('a document of another format or not JSON is refused', () => {
  const namespace = value(ControlPlaneNamespace.open({ dataRoot: dataRoot(), ownerUid }));
  writeFileSync(join(namespace.directory, 'newer'), JSON.stringify({ format: 2 }), { mode: 0o600 });
  writeFileSync(join(namespace.directory, 'broken'), '{', { mode: 0o600 });
  assert.equal(failed(namespace.read('newer')).code, 'precondition-failed');
  assert.equal(failed(namespace.read('broken')).code, 'precondition-failed');
});

test('a symbolic link, a writable directory, or a Git checkout is refused', () => {
  const root = dataRoot();
  mkdirSync(root, { mode: 0o700 });
  symlinkSync(tmpdir(), join(root, 'control-plane'));
  assert.equal(failed(ControlPlaneNamespace.open({ dataRoot: root, ownerUid })).details.reason, 'unsafe-path');

  rmSync(join(root, 'control-plane'));
  chmodSync(root, 0o777);
  assert.equal(failed(ControlPlaneNamespace.open({ dataRoot: root, ownerUid })).details.reason, 'unsafe-path');
  chmodSync(root, 0o700);
  mkdirSync(join(base, '.git'));
  assert.equal(failed(ControlPlaneNamespace.open({ dataRoot: root, ownerUid })).details.reason, 'inside-checkout');
});

test('the installation record holds the identity outside the database', async () => {
  const namespace = value(ControlPlaneNamespace.open({ dataRoot: dataRoot(), ownerUid }));
  const record = new FileInstallationRecord(namespace);
  const identity = value(installationIdentity('0123abcd', 1));
  assert.equal(value(await record.read()), undefined);
  value(await record.create(identity));
  assert.equal(failed(await record.create(identity)).code, 'conflict');
  assert.deepEqual(value(await record.read()), identity);
  writeFileSync(join(namespace.directory, 'installation'), JSON.stringify({ format: 1, installationId: 'a.b', recoveryEpoch: 1 }));
  assert.equal(failed(await record.read()).code, 'precondition-failed');
  writeFileSync(join(namespace.directory, 'installation'), JSON.stringify({ format: 1, installationId: 7 }));
  assert.equal(failed(await record.read()).code, 'precondition-failed');
});

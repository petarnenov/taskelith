import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { ControlPlaneNamespace } from '@taskelith/control-plane-store';
import { EVIDENCE_STORE_CONFORMANCE } from '@taskelith/execution';
import { LocalEvidenceVolume } from '@taskelith/evidence-volume';
import type { Result } from '@taskelith/kernel';
import { parseContentDigest, type ContentDigest } from '@taskelith/sdlc';
import { failed, value } from '@taskelith/testing';

const ownerUid = process.getuid!();
let base: string;

function dataRoot(): string {
  base = mkdtempSync(join(tmpdir(), 'taskelith-evidence-'));
  const root = join(base, 'root');
  value(ControlPlaneNamespace.open({ dataRoot: root, ownerUid }));
  return root;
}

afterEach(() => rmSync(base, { recursive: true, force: true }));

function digestOf(content: Uint8Array): ContentDigest {
  return value(parseContentDigest(`sha256:${createHash('sha256').update(content).digest('hex')}`));
}

function pathOf(volume: LocalEvidenceVolume, digest: ContentDigest): string {
  const hex = digest.slice('sha256:'.length);
  return join(volume.directory, 'sha256', hex.slice(0, 2), hex);
}

for (const conformance of EVIDENCE_STORE_CONFORMANCE) {
  test(`local evidence volume: ${conformance.name}`, async () => {
    assert.deepEqual(await conformance.check(value(LocalEvidenceVolume.open({ dataRoot: dataRoot(), ownerUid }))), []);
  });
}

test('content lives in an owner-only file named by its digest', async () => {
  const volume = value(LocalEvidenceVolume.open({ dataRoot: dataRoot(), ownerUid }));
  const content = Buffer.from('report');
  value(await volume.put(digestOf(content), content));
  const path = pathOf(volume, digestOf(content));
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(statSync(volume.directory).mode & 0o777, 0o700);
});

test('corrupt content is not served, and republishing it repairs the copy', async () => {
  const volume = value(LocalEvidenceVolume.open({ dataRoot: dataRoot(), ownerUid }));
  const content = Buffer.from('accepted evidence');
  const digest = digestOf(content);
  value(await volume.put(digest, content));
  writeFileSync(pathOf(volume, digest), 'tampered');
  const corrupt = failed(await volume.read(digest));
  assert.deepEqual([corrupt.code, corrupt.details.reason], ['internal', 'evidence-corrupt']);
  value(await volume.put(digest, content));
  assert.equal(Buffer.from(value(await volume.read(digest))).toString(), 'accepted evidence');
});

test('missing content is reported absent', async () => {
  const volume = value(LocalEvidenceVolume.open({ dataRoot: dataRoot(), ownerUid }));
  const content = Buffer.from('lost');
  value(await volume.put(digestOf(content), content));
  rmSync(pathOf(volume, digestOf(content)));
  assert.equal(failed(await volume.read(digestOf(content))).code, 'not-found');
});

test('a symbolic link or a writable shard in place of content is refused', async () => {
  const root = dataRoot();
  const volume = value(LocalEvidenceVolume.open({ dataRoot: root, ownerUid }));
  const content = Buffer.from('linked');
  const digest = digestOf(content);
  value(await volume.put(digest, content));
  const path = pathOf(volume, digest);
  rmSync(path);
  writeFileSync(join(base, 'outside'), 'linked');
  symlinkSync(join(base, 'outside'), path);
  const refusals: Result<unknown>[] = [await volume.read(digest), await volume.put(digest, content), await volume.remove(digest)];
  for (const refused of refusals) {
    assert.deepEqual([failed(refused).code, failed(refused).details.reason], ['internal', 'unsafe-path'], 'a volume defect, not a refusal');
  }
  rmSync(path);
  chmodSync(join(path, '..'), 0o777);
  assert.equal(failed(LocalEvidenceVolume.open({ dataRoot: root, ownerUid })).details.reason, 'unsafe-path');
});

test('a directory in place of content is refused', async () => {
  const volume = value(LocalEvidenceVolume.open({ dataRoot: dataRoot(), ownerUid }));
  const content = Buffer.from('directory');
  const digest = digestOf(content);
  value(await volume.put(digest, content));
  rmSync(pathOf(volume, digest));
  value(await volume.put(digestOf(Buffer.from('x')), Buffer.from('x')));
  const sibling = pathOf(volume, digest);
  rmSync(join(sibling, '..'), { recursive: true });
  writeFileSync(join(sibling, '..'), 'not a directory');
  assert.equal(failed(await volume.put(digest, content)).details.reason, 'unsafe-path');
});

test('opening needs the control-plane namespace and removes crash temporaries', async () => {
  base = mkdtempSync(join(tmpdir(), 'taskelith-evidence-'));
  assert.equal(failed(LocalEvidenceVolume.open({ dataRoot: join(base, 'none'), ownerUid })).code, 'precondition-failed');
  rmSync(base, { recursive: true });
  const root = dataRoot();
  const volume = value(LocalEvidenceVolume.open({ dataRoot: root, ownerUid }));
  const content = Buffer.from('kept');
  value(await volume.put(digestOf(content), content));
  const shard = join(pathOf(volume, digestOf(content)), '..');
  writeFileSync(join(shard, '.partial.tmp-0123456789abcdef'), 'half');
  value(LocalEvidenceVolume.open({ dataRoot: root, ownerUid }));
  assert.deepEqual(readdirSync(shard), [digestOf(content).slice('sha256:'.length)]);
  assert.ok(existsSync(pathOf(volume, digestOf(content))));
});

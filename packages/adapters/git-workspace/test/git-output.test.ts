import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { failed, value } from '@taskelith/testing';
import { parseBatchObjects, parsePorcelainStatus, parseTreeListing, snapshotTree, type ListedEntry } from '@taskelith/git-workspace';
import { nativeGit } from './git-fixture.ts';

const OID = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const bytes = (...parts: (string | number[])[]) => Buffer.concat(parts.map((part) => (typeof part === 'string' ? Buffer.from(part) : Buffer.from(part))));
const text = (value: Uint8Array) => Buffer.from(value).toString('latin1');
const NON_UTF8 = [0x6e, 0xff, 0x2e, 0x74];

test('the status parser reads the head, the branch, and every record kind', () => {
  const output = bytes(
    `# branch.oid ${OID}\x00# branch.head taskelith/task\x00# branch.upstream x\x00`,
    `1 .M N... 100644 100644 100644 ${OID} ${OID} a file\x00`,
    `2 R. N... 100644 100644 100644 ${OID} ${OID} R100 new name\x00old name\x00`,
    `u UU N... 100644 100644 100644 100644 ${OID} ${OID} ${OID} conflict\x00`,
    '? ', NON_UTF8, '\x00! ignored\x00',
  );
  const status = value(parsePorcelainStatus(output));
  assert.deepEqual([status.commit, status.branch], [OID, 'taskelith/task']);
  assert.deepEqual(status.entries.map(({ kind, path }) => [kind, text(path)]), [
    ['changed', 'a file'], ['renamed', 'new name'], ['unmerged', 'conflict'], ['untracked', text(Buffer.from(NON_UTF8))], ['ignored', 'ignored'],
  ]);
});

test('the status parser reports a detached head and an unborn branch', () => {
  assert.deepEqual(value(parsePorcelainStatus(bytes(`# branch.oid ${OID}\x00# branch.head (detached)\x00`))), { commit: OID, branch: null, entries: [] });
  assert.deepEqual(value(parsePorcelainStatus(bytes('# branch.oid (initial)\x00# branch.head main\x00'))), { commit: null, branch: 'main', entries: [] });
});

test('the status parser refuses output it cannot read', () => {
  for (const output of ['x what\x00', '1 .M N...\x00', `2 R. N... 100644 100644 100644 ${OID} ${OID} R100 new\x00`, '# branch.oid\x00', `# branch.oid ${OID}`]) {
    assert.equal(failed(parsePorcelainStatus(bytes(output))).code, 'internal', JSON.stringify(output));
  }
});

test('the status parser reads what Git itself prints', async () => {
  const repository = await mkdtemp(join(tmpdir(), 'taskelith-status-'));
  try {
    await nativeGit(repository, ['init', '--quiet', '--initial-branch=main']);
    await writeFile(join(repository, 'tracked'), 'one\n');
    await nativeGit(repository, ['add', '-A']);
    await nativeGit(repository, ['commit', '--quiet', '-m', 'one']);
    await writeFile(join(repository, 'tracked'), 'two\n');
    await writeFile(join(repository, 'new file'), 'new\n');
    const output = await nativeGit(repository, ['status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all']);
    const status = value(parsePorcelainStatus(output));
    const head = (await nativeGit(repository, ['rev-parse', 'HEAD'])).toString('utf8').trim();
    assert.deepEqual([status.commit, status.branch], [head, 'main']);
    assert.deepEqual(status.entries.map(({ kind, path }) => [kind, text(path)]), [['changed', 'tracked'], ['untracked', 'new file']]);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});

test('the tree listing keeps paths as bytes and Git modes as Git canonicalizes them', () => {
  const output = bytes(
    `100644 blob ${OID}\tplain\x00100755 blob ${OID}\trun.sh\x00100664 blob ${OID}\tgroup\x00`,
    `120000 blob ${OTHER}\tlink\x00160000 commit ${OTHER}\tvendor/module\x00100644 blob ${OID}\t`, NON_UTF8, '\x00',
  );
  const entries = value(parseTreeListing(output));
  assert.deepEqual(entries.map((entry) => [entry.type, entry.type === 'blob' ? entry.mode : '', entry.object, text(entry.path)]), [
    ['blob', '100644', OID, 'plain'], ['blob', '100755', OID, 'run.sh'], ['blob', '100644', OID, 'group'],
    ['blob', '120000', OTHER, 'link'], ['gitlink', '', OTHER, 'vendor/module'], ['blob', '100644', OID, text(Buffer.from(NON_UTF8))],
  ]);
  assert.deepEqual(value(parseTreeListing(new Uint8Array())), []);
});

test('the tree listing refuses entries it cannot read', () => {
  for (const output of [`100644 blob ${OID} plain\x00`, `040000 tree ${OID}\tdirectory\x00`, `100644 blob short\tpath\x00`, `100644 blob ${OID}\tunterminated`]) {
    assert.equal(failed(parseTreeListing(bytes(output))).code, 'internal', output);
  }
});

test('the batch reader takes each object by its size, whatever bytes it holds', () => {
  const objects = value(parseBatchObjects(bytes(`${OID} blob 4\n`, [0, 10, 255, 10], `\n${OTHER} blob 0\n\n`)));
  assert.deepEqual([...objects.keys()], [OID, OTHER]);
  assert.deepEqual([...objects.get(OID)!], [0, 10, 255, 10]);
  assert.equal(objects.get(OTHER)!.length, 0);
  for (const output of [`${OID} missing\n`, `${OID} blob 9\nshort\n`, `${OID} blob 1\nab`, `${OID} blob\n`]) {
    assert.equal(failed(parseBatchObjects(bytes(output))).code, 'internal', output);
  }
});

const blob = (path: string | number[], object = OID, mode: '100644' | '100755' | '120000' = '100644'): ListedEntry => ({ type: 'blob', mode, object, path: bytes(path) });

test('the snapshot tree holds files with modes and links with targets', () => {
  const objects = new Map([[OID, bytes('content')], [OTHER, bytes('plain')]]);
  const tree = value(snapshotTree([blob('plain'), blob('run.sh', OID, '100755'), blob('link', OTHER, '120000')], objects));
  assert.deepEqual([...tree], [
    ['plain', { type: 'file', mode: '100644', content: new Uint8Array(bytes('content')) }],
    ['run.sh', { type: 'file', mode: '100755', content: new Uint8Array(bytes('content')) }],
    ['link', { type: 'link', target: 'plain' }],
  ]);
});

test('the snapshot tree refuses a gitlink before text that is not UTF-8', () => {
  const objects = new Map([[OID, bytes('content')], [OTHER, Buffer.from(NON_UTF8)]]);
  const gitlink: ListedEntry = { type: 'gitlink', object: OID, path: bytes('vendor') };
  const refusals: [ListedEntry[], string][] = [
    [[blob(NON_UTF8), gitlink], 'gitlink-in-tree'],
    [[blob(NON_UTF8)], 'non-utf8-path'],
    [[blob('link', OTHER, '120000')], 'non-utf8-path'],
  ];
  for (const [entries, reason] of refusals) {
    const failure = failed(snapshotTree(entries, objects));
    assert.deepEqual([failure.code, failure.details.reason], ['precondition-failed', reason]);
  }
  assert.equal(failed(snapshotTree([blob('plain', 'c'.repeat(40))], objects)).code, 'internal');
});

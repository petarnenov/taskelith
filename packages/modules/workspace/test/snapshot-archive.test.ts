import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readlink, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { encodeHeadSnapshot, type GitTreeEntry } from '@taskelith/workspace';

const text = (value: string) => new TextEncoder().encode(value);
const LONG_PATH = `${'directory/'.repeat(12)}file.txt`;
const LONG_TARGET = `${'../'.repeat(40)}target`;
const TREE: Readonly<Record<string, GitTreeEntry>> = {
  'z.txt': { type: 'file', mode: '100644', content: text('last\n') },
  'z.txt.orig': { type: 'file', mode: '100644', content: text('orig\n') },
  'bin/run.sh': { type: 'file', mode: '100755', content: text('echo run\n') },
  'blob.bin': { type: 'file', mode: '100644', content: Uint8Array.of(0, 128, 255) },
  'café/ü.txt': { type: 'file', mode: '100644', content: text('utf-8\n') },
  latest: { type: 'link', target: 'z.txt' },
  far: { type: 'link', target: LONG_TARGET },
  [LONG_PATH]: { type: 'file', mode: '100644', content: new Uint8Array(1025).fill(7) },
};

const snapshot = (tree: Readonly<Record<string, GitTreeEntry>>) => encodeHeadSnapshot(new Map(Object.entries(tree)));

function encoded(tree: Readonly<Record<string, GitTreeEntry>>): Uint8Array {
  const archive = snapshot(tree);
  assert.ok(archive.ok);
  return archive.value;
}

async function extracted(archive: Uint8Array): Promise<{ directory: string; listing: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'taskelith-snapshot-'));
  const file = join(directory, 'snapshot.tar');
  await writeFile(file, archive);
  const listing = execFileSync('tar', ['-tf', file], { encoding: 'utf8' });
  execFileSync('tar', ['-xf', file, '-C', directory]);
  return { directory, listing };
}

test('equal trees give the same bytes, whatever the order of their entries', () => {
  const reversed = Object.fromEntries(Object.entries(TREE).reverse());
  assert.deepEqual(encoded(reversed), encoded(TREE));
  assert.equal(encoded(TREE).length % 512, 0);
});

test('a changed mode, target, or byte changes the archive', () => {
  const base = encoded(TREE);
  const changes: Record<string, GitTreeEntry>[] = [
    { ...TREE, 'z.txt': { type: 'file', mode: '100755', content: text('last\n') } },
    { ...TREE, latest: { type: 'link', target: 'blob.bin' } },
    { ...TREE, 'blob.bin': { type: 'file', mode: '100644', content: Uint8Array.of(0, 128, 254) } },
  ];
  for (const changed of changes) assert.notDeepEqual(encoded(changed), base);
});

test('tar reads every file and link with its mode, target, bytes, and long path', async () => {
  const { directory, listing } = await extracted(encoded(TREE));
  try {
    assert.equal(await readFile(join(directory, LONG_PATH), 'utf8'), '\u0007'.repeat(1025));
    assert.deepEqual(new Uint8Array(await readFile(join(directory, 'blob.bin'))), Uint8Array.of(0, 128, 255));
    assert.equal(await readFile(join(directory, 'café/ü.txt'), 'utf8'), 'utf-8\n');
    assert.equal(await readlink(join(directory, 'latest')), 'z.txt');
    assert.equal(await readlink(join(directory, 'far')), LONG_TARGET);
    assert.equal((await stat(join(directory, 'bin/run.sh'))).mode & 0o111, 0o111);
    assert.deepEqual(listing.trim().split('\n').sort(), Object.keys(TREE).sort());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a header holds zero owner, group, and time and no user or group name', () => {
  const header = encoded({ 'a.txt': { type: 'file', mode: '100644', content: text('a') } }).subarray(0, 512);
  const field = (from: number, length: number) => new TextDecoder().decode(header.subarray(from, from + length));
  assert.deepEqual([field(108, 8), field(116, 8), field(136, 12)], ['0000000\0', '0000000\0', '00000000000\0']);
  assert.equal(field(257, 8), 'ustar\u000000');
  assert.deepEqual(header.subarray(265, 329), new Uint8Array(64));
});

test('an empty tree is two zero blocks', () => {
  assert.deepEqual(encoded({}), new Uint8Array(1024));
});

test('a tree that holds a gitlink is refused', () => {
  const archive = snapshot({ ...TREE, 'vendor/module': { type: 'gitlink', commit: 'f'.repeat(40) } });
  assert.ok(!archive.ok);
  assert.equal(archive.error.code, 'precondition-failed');
  assert.deepEqual(archive.error.details, { reason: 'gitlink-in-tree' });
  assert.match(archive.error.message, /vendor\/module/);
});

test('a path or link target that UTF-8 cannot carry is refused', () => {
  const trees: Record<string, GitTreeEntry>[] = [
    { 'lone\uD800.txt': { type: 'file', mode: '100644', content: text('x') } },
    { link: { type: 'link', target: 'lone\uDC00' } },
  ];
  for (const tree of trees) {
    const archive = snapshot(tree);
    assert.ok(!archive.ok);
    assert.deepEqual(archive.error.details, { reason: 'non-utf8-path' });
  }
});

test('a gitlink is refused before text that is not UTF-8', () => {
  const archive = snapshot({ 'lone\uD800': { type: 'file', mode: '100644', content: text('x') }, module: { type: 'gitlink', commit: 'f'.repeat(40) } });
  assert.ok(!archive.ok);
  assert.deepEqual(archive.error.details, { reason: 'gitlink-in-tree' });
});

test('entries follow UTF-8 byte order, not UTF-16 code unit order', async () => {
  const astral = '\u{1F600}.txt';
  const private_ = '\uE000.txt';
  assert.ok(astral < private_);
  const tree = { [astral]: { type: 'file', mode: '100644', content: text('a') }, [private_]: { type: 'file', mode: '100644', content: text('b') } } as const;
  const { directory, listing } = await extracted(encoded(tree));
  await rm(directory, { recursive: true, force: true });
  assert.deepEqual(listing.trim().split('\n'), [private_, astral]);
});

test('a path of 100 bytes fits the ustar name, and one of 101 needs pax', () => {
  const typeOfFirst = (path: string) => String.fromCharCode(encoded({ [path]: { type: 'file', mode: '100644', content: text('x') } })[156]!);
  assert.equal(typeOfFirst('p'.repeat(100)), '0');
  assert.equal(typeOfFirst('p'.repeat(101)), 'x');
  assert.equal(typeOfFirst(`${'p'.repeat(99)}\u00e9`), 'x');
});

test('a file named __proto__ is archived', () => {
  const tree = new Map<string, GitTreeEntry>([['__proto__', { type: 'file', mode: '100644', content: text('proto') }]]);
  const archive = encodeHeadSnapshot(tree);
  assert.ok(archive.ok);
  assert.equal(new TextDecoder().decode(archive.value.subarray(0, 9)), '__proto__');
});

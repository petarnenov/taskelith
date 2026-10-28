import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { failed, value } from '@taskelith/testing';
import {
  indexMatchesTree,
  objectName,
  parseBatchObjects,
  parseCommitTree,
  parseIndexEntries,
  parseTreeObject,
  snapshotTree,
  type ListedEntry,
} from '@taskelith/git-workspace';
import { encodeHeadSnapshot } from '@taskelith/workspace';
import { nativeGit } from './git-fixture.ts';

const OID = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const bytes = (...parts: (string | Uint8Array | number[])[]) => Buffer.concat(parts.map((part) => (typeof part === 'string' ? Buffer.from(part) : Buffer.from(part))));
const text = (value: Uint8Array) => Buffer.from(value).toString('latin1');
let repository: string;

before(async () => {
  repository = await mkdtemp(join(tmpdir(), 'taskelith-objects-'));
  await nativeGit(repository, ['init', '--quiet']);
});

after(() => rm(repository, { recursive: true, force: true }));

// A tree object's body: `<mode> <name>\0<raw object name>` per entry.
const treeBody = (entries: readonly [string, string | Uint8Array, string][]) =>
  bytes(...entries.flatMap(([mode, name, object]) => [`${mode} `, typeof name === 'string' ? Buffer.from(name) : name, '\x00', Buffer.from(object, 'hex')]));

// Git's own name for an object stored literally, without its checks.
const literalName = async (type: string, body: Uint8Array) =>
  (await nativeGit(repository, ['hash-object', '-t', type, '--literally', '-w', '--stdin'], { input: body })).toString('utf8').trim();

test('an object name is the hash of its type, size, and bytes, as Git computes it', async () => {
  const body = treeBody([['100644', 'file', OID], ['40000', 'directory', OTHER]]);
  assert.equal(objectName('sha1', 'tree', body), await literalName('tree', body));
  assert.equal(objectName('sha1', 'blob', bytes('content\n')), await literalName('blob', bytes('content\n')));
  assert.match(objectName('sha256', 'blob', bytes('content\n')), /^[0-9a-f]{64}$/);
});

test('a commit names its tree on its first line', () => {
  assert.equal(value(parseCommitTree(bytes(`tree ${OID}\nparent ${OTHER}\n\nmessage\n`), 'sha1')), OID);
  for (const body of [`parent ${OID}\n`, `tree ${OID.slice(1)}\n`, `tree ${OID}`, `tree ${'a'.repeat(64)}\n`]) {
    assert.equal(failed(parseCommitTree(bytes(body), 'sha1')).code, 'internal', body);
  }
});

test('a tree object gives its entries with Git modes canonicalized', () => {
  const entries = value(parseTreeObject(treeBody([
    ['100644', 'plain', OID], ['100755', 'run', OID], ['100664', 'group', OID], ['120000', 'link', OTHER], ['160000', 'module', OTHER], ['40000', 'directory', OTHER],
  ]), 'sha1'));
  assert.deepEqual(entries.map(({ kind, mode, name, object }) => [kind, mode, text(name), object]), [
    ['blob', '100644', 'plain', OID], ['blob', '100755', 'run', OID], ['blob', '100644', 'group', OID],
    ['blob', '120000', 'link', OTHER], ['gitlink', '160000', 'module', OTHER], ['tree', '040000', 'directory', OTHER],
  ]);
  assert.deepEqual(value(parseTreeObject(new Uint8Array(), 'sha1')), []);
});

test('a tree object that cannot be read is refused', () => {
  const refused = [
    bytes('100644 name\x00', Buffer.alloc(19)), bytes('100644name\x00', Buffer.alloc(20)), bytes('100644 name', Buffer.alloc(20)),
    treeBody([['100644garbage', 'name', OID]]), treeBody([['0100644', 'name', OID]]), treeBody([['060000', 'name', OID]]), treeBody([['10064', 'name', OID]]),
  ];
  for (const body of refused) assert.equal(failed(parseTreeObject(body, 'sha1')).code, 'internal', text(body));
});

test('the batch reader takes objects of the requested type only', () => {
  assert.deepEqual([...value(parseBatchObjects(bytes(`${OID} tree 1\nx\n`), [OID], 'tree')).keys()], [OID]);
  assert.equal(failed(parseBatchObjects(bytes(`${OID} blob 1\nx\n`), [OID], 'tree')).code, 'internal');
});

const entry = (path: string[], object = OID): ListedEntry => ({ type: 'blob', mode: '100644', object, path: path.map((part) => bytes(part)) });

test('the snapshot tree refuses names that Git refuses in a path, and duplicates', () => {
  const objects = new Map([[OID, bytes('content')]]);
  const names = ['', '.', '..', '.git', '.GIT', '.Git.', '.git ', '.git::$INDEX_ALLOCATION', 'git~1', 'GIT~1. ', '.g‌it', 'a/b'];
  for (const name of names) {
    const failure = failed(snapshotTree([entry(['dir', name])], objects));
    assert.deepEqual([failure.code, failure.details.reason], ['precondition-failed', 'unsafe-tree-path'], JSON.stringify(name));
  }
  const duplicate = failed(snapshotTree([entry(['dir', 'file']), entry(['dir', 'file'])], objects));
  assert.equal(duplicate.details.reason, 'unsafe-tree-path');
  // A file that is also a directory is the archive's own refusal.
  const fileAndDirectory = failed(encodeHeadSnapshot(value(snapshotTree([entry(['dir']), entry(['dir', 'file'])], objects))));
  assert.equal(fileAndDirectory.details.reason, 'unsafe-tree-path');
  value(snapshotTree([entry(['.github', 'git~2', '.gitignore', 'a..b'])], objects));
});

test('the snapshot tree checks a gitlink first, then UTF-8, then the names', () => {
  const objects = new Map([[OID, bytes('content')]]);
  const gitlink: ListedEntry = { type: 'gitlink', object: OID, path: [bytes('..')] };
  assert.equal(failed(snapshotTree([entry(['..']), gitlink], objects)).details.reason, 'gitlink-in-tree');
  const notUtf8: ListedEntry = { type: 'blob', mode: '100644', object: OID, path: [bytes([0xff])] };
  assert.equal(failed(snapshotTree([entry(['..']), notUtf8], objects)).details.reason, 'non-utf8-path');
});

test('the index entries are read with their mode, object, and stage', () => {
  const entries = value(parseIndexEntries(bytes(`100644 ${OID} 0\tREADME.md\x00160000 ${OTHER} 0\twork\x00100644 ${OID} 2\tconflict\x00`)));
  assert.deepEqual(entries.map(({ mode, object, stage, path }) => [mode, object, stage, text(path)]), [
    ['100644', OID, 0, 'README.md'], ['160000', OTHER, 0, 'work'], ['100644', OID, 2, 'conflict'],
  ]);
  for (const output of [`100644 ${OID} 0\tpath`, `100644 ${OID} 4\tpath\x00`, `10064 ${OID} 0\tpath\x00`, `100644 ${OID} 0\t\x00`, `100644 short 0\tpath\x00`, `100644 ${OID} 0 path\x00`]) {
    assert.equal(failed(parseIndexEntries(bytes(output))).code, 'internal', output);
  }
});

test('the index matches the tree only with the same paths, modes, and objects', () => {
  const tree: ListedEntry[] = [entry(['dir', 'file']), { type: 'gitlink', object: OTHER, path: [bytes('module')] }];
  const index = [
    { mode: '100644', object: OID, stage: 0, path: bytes('dir/file') },
    { mode: '160000', object: OTHER, stage: 0, path: bytes('module') },
  ];
  assert.equal(indexMatchesTree(index, tree), true);
  assert.equal(indexMatchesTree([...index, { mode: '160000', object: OID, stage: 0, path: bytes('work') }], tree), false);
  assert.equal(indexMatchesTree([{ ...index[0]!, object: OTHER }, index[1]!], tree), false);
  assert.equal(indexMatchesTree([{ ...index[0]!, mode: '100755' }, index[1]!], tree), false);
  assert.equal(indexMatchesTree([index[0]!], tree), false);
  const conflicted = [index[1]!, { ...index[0]!, stage: 1 }, { ...index[0]!, stage: 2, object: OTHER }];
  assert.equal(indexMatchesTree(conflicted, tree), true, 'a conflicted path is left to the status');
});

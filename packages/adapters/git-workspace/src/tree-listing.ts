import { err, failure, ok, type Result } from '@taskelith/kernel';
import { decodeGitPath, workspaceFailure, type GitTreeEntry } from '@taskelith/workspace';
import { nulRecords } from './nul-records.js';

// An entry of `git ls-tree -r -z --full-tree`; the path stays bytes until
// the snapshot decodes it, after the gitlink check (contract section 9).
export type ListedEntry =
  | { readonly type: 'blob'; readonly mode: '100644' | '100755' | '120000'; readonly object: string; readonly path: Uint8Array }
  | { readonly type: 'gitlink'; readonly object: string; readonly path: Uint8Array };

const TAB = 0x09;
const NEWLINE = 0x0a;
const OBJECT_NAME = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MODE = /^[0-7]{6}$/;
const BATCH_HEADER = /^([0-9a-f]{40}|[0-9a-f]{64}) blob (0|[1-9][0-9]*)$/;
const REGULAR_FILE = 0o100000;
const FILE_TYPE_MASK = 0o170000;
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

export function parseTreeListing(output: Uint8Array): Result<readonly ListedEntry[]> {
  const records = nulRecords(output);
  if (records === null) return unreadable('ls-tree', 'an unterminated entry');
  const entries: ListedEntry[] = [];
  for (const record of records) {
    const entry = parseListedEntry(record);
    if (entry === null) return unreadable('ls-tree', `the entry "${latin1(record).slice(0, 60)}"`);
    entries.push(entry);
  }
  return ok(entries);
}

// Modes as Git canonicalizes them: a regular file is 100755 when its owner
// may execute it, else 100644.
function parseListedEntry(record: Uint8Array): ListedEntry | null {
  const tab = record.indexOf(TAB);
  if (tab === -1) return null;
  const [mode = '', type, object = '', ...rest] = latin1(record.subarray(0, tab)).split(' ');
  const path = record.subarray(tab + 1);
  if (rest.length > 0 || !MODE.test(mode) || !OBJECT_NAME.test(object) || path.length === 0) return null;
  if (mode === '160000' && type === 'commit') return { type: 'gitlink', object, path };
  if (type !== 'blob') return null;
  if (mode === '120000') return { type: 'blob', mode, object, path };
  const bits = Number.parseInt(mode, 8);
  if ((bits & FILE_TYPE_MASK) !== REGULAR_FILE) return null;
  return { type: 'blob', mode: (bits & 0o100) === 0 ? '100644' : '100755', object, path };
}

// `git cat-file --batch` output, the requested blobs in order: a header
// `<object> blob <size>`, then that many bytes of any value and a newline.
export function parseBatchObjects(output: Uint8Array, requested: readonly string[]): Result<ReadonlyMap<string, Uint8Array>> {
  const objects = new Map<string, Uint8Array>();
  let offset = 0;
  for (const object of requested) {
    const newline = output.indexOf(NEWLINE, offset);
    const header = BATCH_HEADER.exec(latin1(output.subarray(offset, newline === -1 ? offset : newline)));
    const end = newline + 1 + Number(header?.[2]);
    if (header === null || header[1] !== object || !Number.isSafeInteger(end) || output[end] !== NEWLINE) {
      return unreadable('cat-file', `no blob ${object}`);
    }
    objects.set(object, output.subarray(newline + 1, end));
    offset = end + 1;
  }
  return offset === output.length ? ok(objects) : unreadable('cat-file', 'more than the requested objects');
}

// The tree as `encodeHeadSnapshot` takes it: a gitlink is refused first,
// then a path or link target that is not UTF-8.
export function snapshotTree(entries: readonly ListedEntry[], objects: ReadonlyMap<string, Uint8Array>): Result<ReadonlyMap<string, GitTreeEntry>> {
  if (entries.some((entry) => entry.type === 'gitlink')) {
    return workspaceFailure('precondition-failed', 'gitlink-in-tree', 'the tree holds a gitlink');
  }
  const tree = new Map<string, GitTreeEntry>();
  for (const entry of entries) {
    const path = decodeGitPath(entry.path);
    if (!path.ok) return path;
    const content = objects.get(entry.object);
    if (content === undefined || entry.type !== 'blob') return unreadable('cat-file', `no object ${entry.object}`);
    const decoded = decodeEntry(entry.mode, content);
    if (!decoded.ok) return decoded;
    tree.set(path.value, decoded.value);
  }
  return ok(tree);
}

function decodeEntry(mode: '100644' | '100755' | '120000', content: Uint8Array): Result<GitTreeEntry> {
  if (mode !== '120000') return ok({ type: 'file', mode, content: new Uint8Array(content) });
  const target = decodeGitPath(content);
  return target.ok ? ok({ type: 'link', target: target.value }) : target;
}

function unreadable(command: string, what: string): Result<never> {
  return err(failure('internal', `git ${command} printed ${what}`));
}

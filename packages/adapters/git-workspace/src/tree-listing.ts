import { err, failure, ok, type Result } from '@taskelith/kernel';
import { decodeGitPath, isSafeTreeName, unsafeTreePath, workspaceFailure, type GitTreeEntry } from '@taskelith/workspace';
import { objectName, parseCommitTree, parseTreeObject, type GitObjectType } from './git-objects.js';
import type { ObjectFormat } from './repository-config.js';

// An entry of the head's tree with its path as the names of the trees
// that lead to it; names stay bytes until the snapshot decodes them.
export type ListedEntry =
  | { readonly type: 'blob'; readonly mode: '100644' | '100755' | '120000'; readonly object: string; readonly path: readonly Uint8Array[] }
  | { readonly type: 'gitlink'; readonly object: string; readonly path: readonly Uint8Array[] };

// Reads objects of one type by name, as `git cat-file --batch` gives them.
export type ObjectRead = (type: GitObjectType, names: readonly string[]) => Promise<Result<ReadonlyMap<string, Uint8Array>>>;

const NEWLINE = 0x0a;
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

// `git cat-file --batch` output, the requested objects in order: a header
// `<object> <type> <size>`, then that many bytes of any value and a newline.
export function parseBatchObjects(output: Uint8Array, requested: readonly string[], type: GitObjectType): Result<ReadonlyMap<string, Uint8Array>> {
  const header = new RegExp(`^([0-9a-f]{40}|[0-9a-f]{64}) ${type} (0|[1-9][0-9]*)$`);
  const objects = new Map<string, Uint8Array>();
  let offset = 0;
  for (const object of requested) {
    const newline = output.indexOf(NEWLINE, offset);
    const fields = header.exec(latin1(output.subarray(offset, newline === -1 ? offset : newline)));
    const end = newline + 1 + Number(fields?.[2]);
    if (fields === null || fields[1] !== object || !Number.isSafeInteger(end) || output[end] !== NEWLINE) {
      return unreadable(`no ${type} ${object}`);
    }
    objects.set(object, output.subarray(newline + 1, end));
    offset = end + 1;
  }
  return offset === output.length ? ok(objects) : unreadable('more than the requested objects');
}

// The objects as `read` gives them, each checked against its name, so a
// forged pack, loose object, or index of objects is refused.
export async function readVerified(read: ObjectRead, format: ObjectFormat, type: GitObjectType, names: readonly string[]): Promise<Result<ReadonlyMap<string, Uint8Array>>> {
  const objects = await read(type, names);
  if (!objects.ok) return objects;
  const forged = [...objects.value].find(([name, body]) => objectName(format, type, body) !== name);
  return forged === undefined ? objects : err(failure('internal', `the ${type} ${forged[0]} does not hash to its name`));
}

// The head commit's tree, read level by level from verified objects.
export async function readHeadTree(read: ObjectRead, format: ObjectFormat, commit: string): Promise<Result<{ tree: string; entries: ListedEntry[] }>> {
  const commits = await readVerified(read, format, 'commit', [commit]);
  if (!commits.ok) return commits;
  const tree = parseCommitTree(commits.value.get(commit)!, format);
  if (!tree.ok) return tree;
  const entries: ListedEntry[] = [];
  for (let level = [{ object: tree.value, path: [] as Uint8Array[] }]; level.length > 0;) {
    const trees = await readVerified(read, format, 'tree', [...new Set(level.map(({ object }) => object))]);
    if (!trees.ok) return trees;
    const next: typeof level = [];
    for (const { object, path } of level) {
      const parsed = parseTreeObject(trees.value.get(object)!, format);
      if (!parsed.ok) return parsed;
      for (const entry of parsed.value) {
        const at = [...path, entry.name];
        if (entry.kind === 'tree') next.push({ object: entry.object, path: at });
        else entries.push(entry.kind === 'gitlink' ? { type: 'gitlink', object: entry.object, path: at } : { type: 'blob', mode: entry.mode, object: entry.object, path: at });
      }
    }
    level = next;
  }
  return ok({ tree: tree.value, entries });
}

interface DecodedEntry {
  readonly names: readonly string[];
  readonly entry: GitTreeEntry;
}

// The tree as `encodeHeadSnapshot` takes it: a gitlink is refused first,
// then text that is not UTF-8, then a name Git refuses or a duplicate.
export function snapshotTree(entries: readonly ListedEntry[], objects: ReadonlyMap<string, Uint8Array>): Result<ReadonlyMap<string, GitTreeEntry>> {
  if (entries.some((entry) => entry.type === 'gitlink')) {
    return workspaceFailure('precondition-failed', 'gitlink-in-tree', 'the tree holds a gitlink');
  }
  const decoded: DecodedEntry[] = [];
  for (const entry of entries) {
    const one = decodeListed(entry, objects);
    if (!one.ok) return one;
    decoded.push(one.value);
  }
  const tree = new Map<string, GitTreeEntry>();
  for (const { names, entry } of decoded) {
    const path = names.join('/');
    if (!names.every(isSafeTreeName) || tree.has(path)) return unsafeTreePath(path);
    tree.set(path, entry);
  }
  return ok(tree);
}

function decodeListed(entry: ListedEntry, objects: ReadonlyMap<string, Uint8Array>): Result<DecodedEntry> {
  const names: string[] = [];
  for (const name of entry.path) {
    const decoded = decodeGitPath(name);
    if (!decoded.ok) return decoded;
    names.push(decoded.value);
  }
  const content = objects.get(entry.object);
  if (content === undefined || entry.type !== 'blob') return unreadable(`no blob ${entry.object}`);
  if (entry.mode !== '120000') return ok({ names, entry: { type: 'file', mode: entry.mode, content: new Uint8Array(content) } });
  const target = decodeGitPath(content);
  return target.ok ? ok({ names, entry: { type: 'link', target: target.value } }) : target;
}

function unreadable(what: string): Result<never> {
  return err(failure('internal', `git cat-file printed ${what}`));
}

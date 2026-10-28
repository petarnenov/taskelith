import { createHash } from 'node:crypto';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { ObjectFormat } from './repository-config.js';

export type GitObjectType = 'blob' | 'tree' | 'commit';

// An entry of a tree object, its mode canonicalized as Git reads it.
export type TreeObjectEntry =
  | { readonly kind: 'tree'; readonly mode: '040000'; readonly name: Uint8Array; readonly object: string }
  | { readonly kind: 'blob'; readonly mode: '100644' | '100755' | '120000'; readonly name: Uint8Array; readonly object: string }
  | { readonly kind: 'gitlink'; readonly mode: '160000'; readonly name: Uint8Array; readonly object: string };

const NAME_BYTES: Readonly<Record<ObjectFormat, number>> = { sha1: 20, sha256: 32 };
const SPACE = 0x20;
const NUL = 0;
// Octal without a leading zero, as Git writes a tree entry's mode.
const TREE_MODE = /^[1-7][0-7]{4,5}$/;
const FILE_TYPE = 0o170000;
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

// The name Git gives an object: the hash of `<type> <size>\0` and its
// bytes, so bytes that do not hash to their name were not Git's.
export function objectName(format: ObjectFormat, type: GitObjectType, body: Uint8Array): string {
  return createHash(format).update(`${type} ${body.length}\0`).update(body).digest('hex');
}

export function parseCommitTree(body: Uint8Array, format: ObjectFormat): Result<string> {
  const pattern = new RegExp(`^tree ([0-9a-f]{${2 * NAME_BYTES[format]}})\n`);
  const tree = pattern.exec(latin1(body.subarray(0, 6 + 2 * NAME_BYTES[format])));
  return tree === null ? unreadable('a commit without a tree') : ok(tree[1]!);
}

// The parents that a commit names right after its tree, in their order.
export function parseCommitParents(body: Uint8Array, format: ObjectFormat): Result<readonly string[]> {
  const name = `[0-9a-f]{${2 * NAME_BYTES[format]}}`;
  const lines = new RegExp(`^tree ${name}\n((?:parent ${name}\n)*)`).exec(latin1(body));
  if (lines === null) return unreadable('a commit without a tree');
  return ok(lines[1]!.split('\n').filter(Boolean).map((line) => line.slice('parent '.length)));
}

// `<mode> <name>\0<raw object name>` per entry; names stay bytes for the
// snapshot's checks, which come after its gitlink check.
export function parseTreeObject(body: Uint8Array, format: ObjectFormat): Result<readonly TreeObjectEntry[]> {
  const entries: TreeObjectEntry[] = [];
  for (let offset = 0; offset < body.length;) {
    const space = body.indexOf(SPACE, offset);
    const nul = space === -1 ? -1 : body.indexOf(NUL, space + 1);
    const end = nul + 1 + NAME_BYTES[format];
    const mode = latin1(body.subarray(offset, space === -1 ? offset : space));
    const kind = nul === -1 || end > body.length ? undefined : entryKind(mode);
    if (kind === undefined) return unreadable(`a tree entry with the mode "${mode.slice(0, 20)}"`);
    entries.push({ ...kind, name: body.subarray(space + 1, nul), object: Buffer.from(body.subarray(nul + 1, end)).toString('hex') } as TreeObjectEntry);
    offset = end;
  }
  return ok(entries);
}

function entryKind(mode: string): Pick<TreeObjectEntry, 'kind' | 'mode'> | undefined {
  if (!TREE_MODE.test(mode)) return undefined;
  const bits = Number.parseInt(mode, 8);
  switch (bits & FILE_TYPE) {
    case 0o040000: return { kind: 'tree', mode: '040000' };
    case 0o120000: return { kind: 'blob', mode: '120000' };
    case 0o160000: return { kind: 'gitlink', mode: '160000' };
    case 0o100000: return { kind: 'blob', mode: (bits & 0o100) === 0 ? '100644' : '100755' };
    default: return undefined;
  }
}

function unreadable(what: string): Result<never> {
  return err(failure('internal', `Git holds ${what}`));
}

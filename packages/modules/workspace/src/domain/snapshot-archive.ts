import { ok, type Result } from '@taskelith/kernel';
import { isUtf8Text, nonUtf8Path, workspaceFailure, type GitTreeEntry, type TreeEntry } from './workspace.js';

// Taskelith's own tar of a tree (contract section 10): byte-identical for
// equal trees, whatever Git version or workspace produced the entries.
export const HEAD_SNAPSHOT_CONTENT_TYPE = 'application/x-tar';

const BLOCK = 512;
const USTAR_NAME_BYTES = 100;
const USTAR_MAX_SIZE = 0o77777777777;
const PAX_HEADER_NAME = 'PaxHeader';
const utf8 = (text: string) => new TextEncoder().encode(text);

// Files and links only, in byte order of their UTF-8 paths, without
// directory entries; a gitlink or text that is not UTF-8 is refused.
export function encodeHeadSnapshot(tree: Readonly<Record<string, GitTreeEntry>>): Result<Uint8Array> {
  const texts = Object.entries(tree).flatMap(([path, entry]) => (entry.type === 'link' ? [path, entry.target] : [path]));
  if (!texts.every(isUtf8Text)) return nonUtf8Path();
  const entries = Object.entries(tree).map(([path, entry]) => ({ path: utf8(path), entry }));
  const gitlink = entries.find(({ entry }) => entry.type === 'gitlink');
  if (gitlink !== undefined) {
    const path = new TextDecoder().decode(gitlink.path);
    return workspaceFailure('precondition-failed', 'gitlink-in-tree', `the tree holds a gitlink at ${path}`);
  }
  const blocks = entries
    .sort((left, right) => compareBytes(left.path, right.path))
    .flatMap(({ path, entry }) => entryBlocks(path, entry as TreeEntry));
  return ok(concat([...blocks, new Uint8Array(2 * BLOCK)]));
}

function entryBlocks(path: Uint8Array, entry: TreeEntry): Uint8Array[] {
  const content = entry.type === 'file' ? entry.content : new Uint8Array();
  const target = entry.type === 'link' ? utf8(entry.target) : new Uint8Array();
  const pax = paxRecords(path, target, content.length);
  const header = ustarHeader({
    name: path.subarray(0, USTAR_NAME_BYTES),
    mode: entry.type === 'link' ? 0o777 : entry.mode === '100755' ? 0o755 : 0o644,
    size: content.length > USTAR_MAX_SIZE ? 0 : content.length,
    type: entry.type === 'link' ? '2' : '0',
    linkName: target.subarray(0, USTAR_NAME_BYTES),
  });
  const extended = pax.length === 0 ? [] : [paxHeader(pax), padded(pax)];
  return [...extended, header, padded(content)];
}

// Pax records carry what a ustar field cannot hold whole.
function paxRecords(path: Uint8Array, target: Uint8Array, size: number): Uint8Array {
  const records: Uint8Array[] = [];
  if (path.length > USTAR_NAME_BYTES) records.push(paxRecord('path', path));
  if (target.length > USTAR_NAME_BYTES) records.push(paxRecord('linkpath', target));
  if (size > USTAR_MAX_SIZE) records.push(paxRecord('size', utf8(String(size))));
  return concat(records);
}

// `<length> <key>=<value>\n`, where the length counts its own digits.
function paxRecord(key: string, value: Uint8Array): Uint8Array {
  const body = concat([utf8(` ${key}=`), value, utf8('\n')]);
  let length = body.length + 1;
  while (String(length).length + body.length !== length) length += 1;
  return concat([utf8(String(length)), body]);
}

function paxHeader(records: Uint8Array): Uint8Array {
  const name = utf8(PAX_HEADER_NAME);
  return ustarHeader({ name, mode: 0o644, size: records.length, type: 'x', linkName: new Uint8Array() });
}

interface HeaderFields {
  readonly name: Uint8Array;
  readonly mode: number;
  readonly size: number;
  readonly type: '0' | '2' | 'x';
  readonly linkName: Uint8Array;
}

// Owner, group, and time are zero and the user and group names empty.
function ustarHeader(fields: HeaderFields): Uint8Array {
  const header = new Uint8Array(BLOCK);
  header.set(fields.name, 0);
  header.set(octal(fields.mode, 8), 100);
  header.set(octal(0, 8), 108);
  header.set(octal(0, 8), 116);
  header.set(octal(fields.size, 12), 124);
  header.set(octal(0, 12), 136);
  header.set(utf8(fields.type), 156);
  header.set(fields.linkName, 157);
  header.set(utf8('ustar\u000000'), 257);
  header.set(utf8(' '.repeat(8)), 148);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.set(utf8(`${checksum.toString(8).padStart(6, '0')}\u0000 `), 148);
  return header;
}

function octal(value: number, width: number): Uint8Array {
  return utf8(`${value.toString(8).padStart(width - 1, '0')}\u0000`);
}

function padded(content: Uint8Array): Uint8Array {
  const length = Math.ceil(content.length / BLOCK) * BLOCK;
  const block = new Uint8Array(length);
  block.set(content);
  return block;
}

function compareBytes(left: Uint8Array, right: Uint8Array): number {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    if (left[index] !== right[index]) return left[index]! - right[index]!;
  }
  return left.length - right.length;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

import { err, failure, ok, type Result } from '@taskelith/kernel';
import { nulRecords } from './nul-records.js';
import type { ListedEntry } from './tree-listing.js';

export interface IndexEntry {
  readonly mode: string;
  readonly object: string;
  // 0 for a merged path, 1 to 3 for the sides of a conflict.
  readonly stage: number;
  readonly path: Uint8Array;
}

const TAB = 0x09;
const ENTRY = /^([0-7]{6}) ([0-9a-f]{40}|[0-9a-f]{64}) ([0-3])$/;
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

// Reads `git ls-files --stage -z`: `<mode> <object> <stage>\t<path>`.
export function parseIndexEntries(output: Uint8Array): Result<readonly IndexEntry[]> {
  const records = nulRecords(output);
  if (records === null) return unreadable('an unterminated entry');
  const entries: IndexEntry[] = [];
  for (const record of records) {
    const tab = record.indexOf(TAB);
    const fields = tab === -1 ? null : ENTRY.exec(latin1(record.subarray(0, tab)));
    if (fields === null || tab === record.length - 1) return unreadable(`the entry "${latin1(record).slice(0, 60)}"`);
    entries.push({ mode: fields[1]!, object: fields[2]!, stage: Number(fields[3]), path: record.subarray(tab + 1) });
  }
  return ok(entries);
}

// The input of `git update-index -z --index-info` that writes the same
// entries anew: without stat data, flags, or a cache tree.
export function indexInfo(entries: readonly IndexEntry[]): Uint8Array {
  return Buffer.concat(entries.flatMap(({ mode, object, stage, path }) => [Buffer.from(`${mode} ${object} ${stage}\t`), path, Buffer.of(0)]));
}

// Whether the merged entries are exactly the tree's files, links, and
// gitlinks; a conflicted path is left to the status.
export function indexMatchesTree(index: readonly IndexEntry[], tree: readonly ListedEntry[]): boolean {
  const conflicted = new Set(index.filter(({ stage }) => stage !== 0).map(({ path }) => latin1(path)));
  const key = (mode: string, object: string, path: string) => `${mode} ${object} ${path}`;
  const staged = index.filter(({ stage }) => stage === 0).map(({ mode, object, path }) => key(mode, object, latin1(path)));
  const committed = tree
    .filter((entry) => entry.type !== 'tree')
    .map((entry) => ({ entry, path: latin1(Buffer.concat(entry.path.flatMap((name, at) => (at === 0 ? [name] : [Buffer.from('/'), name])))) }))
    .filter(({ path }) => !conflicted.has(path))
    .map(({ entry, path }) => key(entry.type === 'blob' ? entry.mode : '160000', entry.object, path));
  return staged.length === committed.length && staged.sort().join('\0') === committed.sort().join('\0');
}

function unreadable(what: string): Result<never> {
  return err(failure('internal', `git ls-files printed ${what}`));
}

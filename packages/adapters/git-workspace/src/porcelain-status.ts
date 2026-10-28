import { err, failure, ok, type Result } from '@taskelith/kernel';
import { afterFields, nulRecords } from './nul-records.js';

export type StatusEntryKind = 'changed' | 'renamed' | 'unmerged' | 'untracked' | 'ignored';

// A path stays bytes: an untracked name that is not UTF-8 still makes the
// workspace dirty, and only `snapshot` refuses such a name (section 9).
export interface StatusEntry {
  readonly kind: StatusEntryKind;
  readonly path: Uint8Array;
}

export interface PorcelainStatus {
  // Null before the first commit.
  readonly commit: string | null;
  // Null when the head is detached.
  readonly branch: string | null;
  readonly entries: readonly StatusEntry[];
}

// The fields before the path of each record type of porcelain v2.
const PATH_FIELDS: Readonly<Record<string, [StatusEntryKind, number]>> = {
  '1': ['changed', 8],
  '2': ['renamed', 9],
  u: ['unmerged', 10],
  '?': ['untracked', 1],
  '!': ['ignored', 1],
};

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

// Reads `git status --porcelain=v2 -z --branch` output.
export function parsePorcelainStatus(output: Uint8Array): Result<PorcelainStatus> {
  const records = nulRecords(output);
  if (records === null) return unreadable('an unterminated record');
  let commit: string | null = null;
  let branch: string | null = null;
  const entries: StatusEntry[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const type = latin1(record.subarray(0, 1));
    if (type === '#') {
      const header = parseHeader(record);
      if (header === null) return unreadable('a header without a value');
      if (header.key === 'branch.oid') commit = header.value === '(initial)' ? null : header.value;
      if (header.key === 'branch.head') branch = header.value === '(detached)' ? null : new TextDecoder().decode(header.bytes);
      continue;
    }
    const shape = PATH_FIELDS[type];
    const path = shape === undefined ? null : afterFields(record, shape[1]);
    if (shape === undefined || path === null) return unreadable(`a record of type "${type}"`);
    // A rename's original path is the next record.
    if (shape[0] === 'renamed' && ++index >= records.length) return unreadable('a rename without its original path');
    entries.push({ kind: shape[0], path });
  }
  return ok({ commit, branch, entries });
}

function parseHeader(record: Uint8Array): { key: string; value: string; bytes: Uint8Array } | null {
  const key = afterFields(record, 1);
  const bytes = afterFields(record, 2);
  if (key === null || bytes === null) return null;
  return { key: latin1(key.subarray(0, key.length - bytes.length - 1)), value: latin1(bytes), bytes };
}

function unreadable(what: string): Result<never> {
  return err(failure('internal', `git status printed ${what}`));
}

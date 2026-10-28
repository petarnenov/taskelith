import { err, failure, ok, type Result } from '@taskelith/kernel';
import { nulRecords, splitFields } from './nul-records.js';

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

const HASH = 0x23;
const XY = /^[.MTADRCU]{2}$/;
const SUBMODULE = /^(?:N\.\.\.|S[C.][M.][U.])$/;
const MODE = /^[0-7]{6}$/;
const OBJECT_NAME = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SCORE = /^[RC][0-9]{1,3}$/;
const INITIAL = '(initial)';

// The fields before the path of each record type of porcelain v2.
const RECORD_FIELDS: Readonly<Record<string, readonly [StatusEntryKind, readonly RegExp[]]>> = {
  '1': ['changed', [XY, SUBMODULE, MODE, MODE, MODE, OBJECT_NAME, OBJECT_NAME]],
  '2': ['renamed', [XY, SUBMODULE, MODE, MODE, MODE, OBJECT_NAME, OBJECT_NAME, SCORE]],
  u: ['unmerged', [XY, SUBMODULE, MODE, MODE, MODE, MODE, OBJECT_NAME, OBJECT_NAME, OBJECT_NAME]],
  '?': ['untracked', []],
  '!': ['ignored', []],
};

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

// Reads `git status --porcelain=v2 -z --branch` output.
export function parsePorcelainStatus(output: Uint8Array): Result<PorcelainStatus> {
  const records = nulRecords(output);
  if (records === null) return unreadable('an unterminated record');
  const headers = new Map<string, Uint8Array>();
  const entries: StatusEntry[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    if (record[0] === HASH) {
      const header = splitFields(record, 2);
      if (header?.fields[0] !== '#' || header.rest.length === 0) return unreadable('a header without a value');
      headers.set(header.fields[1]!, header.rest);
      continue;
    }
    const entry = parseEntry(record);
    if (entry === null) return unreadable(`the record "${latin1(record).slice(0, 60)}"`);
    if (entry.kind === 'renamed') {
      // A rename's original path is the next record.
      index += 1;
      if ((records[index]?.length ?? 0) === 0) return unreadable('a rename without its original path');
    }
    entries.push(entry);
  }
  return withBranch(headers, entries);
}

function parseEntry(record: Uint8Array): StatusEntry | null {
  const shape = RECORD_FIELDS[latin1(record.subarray(0, 1))];
  if (shape === undefined) return null;
  const [kind, patterns] = shape;
  const split = splitFields(record, patterns.length + 1);
  if (split === null || split.rest.length === 0) return null;
  const [type, ...fields] = split.fields;
  const valid = type!.length === 1 && patterns.every((pattern, at) => pattern.test(fields[at]!));
  return valid ? { kind, path: split.rest } : null;
}

function withBranch(headers: ReadonlyMap<string, Uint8Array>, entries: StatusEntry[]): Result<PorcelainStatus> {
  const oid = headers.get('branch.oid');
  const head = headers.get('branch.head');
  if (oid === undefined || head === undefined) return unreadable('no branch.oid or branch.head header');
  const commit = latin1(oid);
  if (commit !== INITIAL && !OBJECT_NAME.test(commit)) return unreadable(`the commit "${commit.slice(0, 80)}"`);
  const branch = latin1(head) === '(detached)' ? null : new TextDecoder().decode(head);
  return ok({ commit: commit === INITIAL ? null : commit, branch, entries });
}

function unreadable(what: string): Result<never> {
  return err(failure('internal', `git status printed ${what}`));
}

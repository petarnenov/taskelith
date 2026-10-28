import { err, failure, ok, type Result } from '@taskelith/kernel';
import { nulRecords } from './nul-records.js';

// The paths whose index entry makes `git status` skip the working tree.
export interface HiddenPaths {
  readonly assumeUnchanged: readonly Uint8Array[];
  readonly skipWorktree: readonly Uint8Array[];
}

const SPACE = 0x20;
const TAG = /^[A-Za-z]$/;

// Reads `git ls-files -v -z`: a tag, a space, and the path; a lowercase
// tag marks assume-unchanged, `S` or `s` skip-worktree.
export function parseIndexFlags(output: Uint8Array): Result<HiddenPaths> {
  const records = nulRecords(output);
  if (records === null) return unreadable('an unterminated entry');
  const assumeUnchanged: Uint8Array[] = [];
  const skipWorktree: Uint8Array[] = [];
  for (const record of records) {
    const tag = String.fromCharCode(record[0] ?? 0);
    if (!TAG.test(tag) || record[1] !== SPACE || record.length < 3) return unreadable('an entry without a tag and a path');
    const path = record.subarray(2);
    if (tag !== tag.toUpperCase()) assumeUnchanged.push(path);
    if (tag.toUpperCase() === 'S') skipWorktree.push(path);
  }
  return ok({ assumeUnchanged, skipWorktree });
}

function unreadable(what: string): Result<never> {
  return err(failure('internal', `git ls-files printed ${what}`));
}

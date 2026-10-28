import { constants } from 'node:fs';
import { open, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { replaceFileAsync, syncPathAsync } from '@taskelith/data-root';
import type { AttemptId } from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';

// Where a reclaim program runs: a cgroup under the containment parent, or
// a process group where the identities are one account (contract section 3).
export type ReclaimContainment =
  | { readonly kind: 'cgroup'; readonly name: string }
  | { readonly kind: 'process-group'; readonly id: number };

// The worker's hand-off state beside the checkout; its presence alone
// means handed off, also where no mode changes.
export interface HandOffRecord {
  // The reclaim program's containment, recorded before the program acts.
  readonly containment: ReclaimContainment | null;
  // The program failed or was killed; it never runs again by itself.
  readonly reclaimFailed: boolean;
}

// A handed-off workspace's attempt with its record.
export interface HandedOffWorkspace {
  readonly attemptId: AttemptId;
  readonly record: HandOffRecord;
}

export const HANDED_OFF: HandOffRecord = Object.freeze({ containment: null, reclaimFailed: false });

export function writeHandOffRecord(path: string, record: HandOffRecord): Promise<Result<void>> {
  return replaceFileAsync(path, new TextEncoder().encode(JSON.stringify(record)));
}

// Removes the record durably; an absent one is already removed.
export async function removeHandOffRecord(path: string): Promise<Result<void>> {
  await rm(path, { force: true });
  return syncPathAsync(dirname(path));
}

// Undefined when absent, `internal` when malformed; a fault rejects.
export async function readHandOffRecord(path: string): Promise<Result<HandOffRecord | undefined>> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (handle === undefined) return ok(undefined);
  try {
    const record = parseHandOffRecord(await handle.readFile('utf8'));
    return record === null ? err(failure('internal', `the hand-off record ${path} is malformed`)) : ok(record);
  } finally {
    await handle.close();
  }
}

export function parseHandOffRecord(text: string): HandOffRecord | null {
  let record: Partial<HandOffRecord> | null;
  try {
    record = JSON.parse(text) as Partial<HandOffRecord> | null;
  } catch {
    return null;
  }
  if (typeof record !== 'object' || record === null || !('containment' in record) || typeof record.reclaimFailed !== 'boolean') return null;
  const containment: unknown = record.containment;
  return containment === null || isContainment(containment) ? { containment, reclaimFailed: record.reclaimFailed } : null;
}

function isContainment(value: unknown): value is ReclaimContainment {
  const { kind, name, id } = value as { kind?: unknown; name?: unknown; id?: unknown };
  if (kind === 'cgroup') return typeof name === 'string' && /^[A-Za-z0-9_-]+$/.test(name);
  return kind === 'process-group' && Number.isSafeInteger(id) && (id as number) > 1;
}

import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { replaceFileAsync } from '@taskelith/data-root';
import { type Result } from '@taskelith/kernel';
import type { AttemptId } from '@taskelith/execution';
import { WORKSPACE_KINDS, type RepositoryBinding, type WorkspaceKind } from '@taskelith/workspace';
import type { ObjectFormat } from './repository-config.js';

// The worker's record beside the checkout (contract section 2); Git work
// takes these values from it, never from the checkout.
export interface WorkspaceRecord {
  readonly attemptId: AttemptId;
  readonly kind: WorkspaceKind;
  // The task branch; null for an `at-head` workspace.
  readonly branch: string | null;
  readonly binding: RepositoryBinding;
  readonly objectFormat: ObjectFormat;
}

export function writeWorkspaceRecord(path: string, record: WorkspaceRecord): Promise<Result<void>> {
  return replaceFileAsync(path, new TextEncoder().encode(JSON.stringify(record)));
}

// Undefined when the record is absent; a record that cannot be read or
// parsed rejects, as a disk fault does.
export async function readWorkspaceRecord(path: string): Promise<WorkspaceRecord | undefined> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (handle === undefined) return undefined;
  try {
    return parseRecord(await handle.readFile('utf8'), path);
  } finally {
    await handle.close();
  }
}

function parseRecord(text: string, path: string): WorkspaceRecord {
  const record = JSON.parse(text) as Partial<WorkspaceRecord>;
  const { binding } = record;
  const valid = typeof record.attemptId === 'string'
    && WORKSPACE_KINDS.includes(record.kind as WorkspaceKind)
    && (record.branch === null || typeof record.branch === 'string')
    && typeof binding?.repository === 'string' && typeof binding.remote === 'string' && typeof binding.baseBranch === 'string'
    && (record.objectFormat === 'sha1' || record.objectFormat === 'sha256');
  if (!valid) throw new Error(`the workspace record ${path} is malformed`);
  return record as WorkspaceRecord;
}

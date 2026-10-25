import { existsSync, readFileSync } from 'node:fs';
import { parseIdentifier, err, ok, type Result } from '@taskelith/kernel';
import type { InstallationId, JournalId, WorkerId } from '@taskelith/execution';
import { syncBeforeUse } from './durable-file.js';
import { rootFailure } from './journal-failure.js';

// `worker/identity` without the credential references, which item 13 adds.
export interface WorkerIdentity {
  readonly installationId: InstallationId;
  readonly workerId: WorkerId;
  readonly journalId: JournalId;
}

export const IDENTITY_FORMAT = 1;

export function serializeIdentity(identity: WorkerIdentity): string {
  const { installationId, workerId, journalId } = identity;
  return `${JSON.stringify({ format: IDENTITY_FORMAT, installationId, workerId, journalId })}\n`;
}

// No identity means the worker is not enrolled (contract section 8).
export function readIdentity(path: string): Result<WorkerIdentity> {
  if (!existsSync(path)) return err(rootFailure('not-enrolled', `no worker identity at ${path}`, { path }));
  const synced = syncBeforeUse(path);
  if (!synced.ok) return synced;
  let stored: Record<string, unknown>;
  try {
    stored = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return err(rootFailure('corrupt', `the worker identity ${path} is not JSON`, { path }));
  }
  if (typeof stored.format !== 'number' || stored.format > IDENTITY_FORMAT) {
    return err(rootFailure('newer-format', `identity format ${String(stored.format)} is not supported`, { path }));
  }
  const installationId = parseIdentifier('InstallationId', String(stored.installationId));
  const workerId = parseIdentifier('WorkerId', String(stored.workerId));
  const journalId = parseIdentifier('JournalId', String(stored.journalId));
  if (!installationId.ok || !workerId.ok || !journalId.ok) {
    return err(rootFailure('corrupt', `the worker identity ${path} has invalid identifiers`, { path }));
  }
  return ok(Object.freeze({ installationId: installationId.value, workerId: workerId.value, journalId: journalId.value }));
}

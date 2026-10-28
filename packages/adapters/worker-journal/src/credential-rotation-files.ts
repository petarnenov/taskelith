import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { checkControlPath, createOnce, replaceFile, syncBeforeUse, syncPath } from '@taskelith/data-root';
import { rootFailure } from './journal-failure.js';
import { credentialReferencesOf, readControlFile, type WorkerCredentials } from './worker-credentials.js';
import { serializeIdentity, type WorkerIdentity } from './worker-identity.js';
import { ownerUid, type WorkerPaths } from './worker-paths.js';

// The secrets of a generation the worker made before it renews it: the
// `tkwk_` bearer secret and the NKey seed (installation contract sec. 10).
export interface PendingGeneration {
  readonly credentialGeneration: number;
  readonly controlPlane: string;
  readonly brokerSeed: string;
}

const PENDING_FORMAT = 1;

function pendingPath(paths: WorkerPaths, generation: number): string {
  return join(paths.credentials, `pending.${generation}`);
}

// Created once at mode 0600; when one exists, its secrets win, since the
// control plane may already have signed for them.
export function storePendingGeneration(paths: WorkerPaths, pending: PendingGeneration): Result<PendingGeneration> {
  const { credentialGeneration, controlPlane, brokerSeed } = pending;
  const content = `${JSON.stringify({ format: PENDING_FORMAT, credentialGeneration, controlPlane, brokerSeed })}\n`;
  const created = createOnce(pendingPath(paths, credentialGeneration), content);
  if (created.ok) return ok(Object.freeze({ credentialGeneration, controlPlane, brokerSeed }));
  if (created.error.code !== 'conflict') return created;
  return readStoredPending(paths, credentialGeneration);
}

// The pending generation `generation`, if the worker stored one.
export function readPendingGeneration(paths: WorkerPaths, generation: number): Result<PendingGeneration | undefined> {
  const path = pendingPath(paths, generation);
  const safe = checkControlPath(paths.dataRoot, path, ownerUid());
  if (!safe.ok) return safe;
  return existsSync(path) ? readStoredPending(paths, generation) : ok(undefined);
}

function readStoredPending(paths: WorkerPaths, generation: number): Result<PendingGeneration> {
  const path = pendingPath(paths, generation);
  const text = readControlFile(paths, path, `the pending credential generation ${generation}`);
  if (!text.ok) return text;
  let stored: Record<string, unknown>;
  try {
    stored = JSON.parse(text.value) as Record<string, unknown>;
  } catch {
    return err(rootFailure('corrupt', `the pending credential generation ${generation} is not JSON`, { path }));
  }
  const { format, credentialGeneration, controlPlane, brokerSeed } = stored;
  if (format !== PENDING_FORMAT || credentialGeneration !== generation || !isText(controlPlane) || !isText(brokerSeed)) {
    return err(rootFailure('corrupt', `the pending credential generation ${generation} has invalid values`, { path }));
  }
  return ok(Object.freeze({ credentialGeneration: generation, controlPlane, brokerSeed }));
}

// The renewed generation's files are created once, then the identity names
// it current and keeps the previous one until the confirmation.
export function adoptGeneration(
  paths: WorkerPaths,
  identity: WorkerIdentity,
  generation: number,
  credentials: WorkerCredentials,
): Result<WorkerIdentity> {
  if (identity.previous !== undefined || generation !== identity.credentialGeneration + 1) {
    return err(failure('conflict', `generation ${generation} does not follow the confirmed generation ${identity.credentialGeneration}`));
  }
  const references = credentialReferencesOf(generation);
  for (const field of ['controlPlane', 'broker'] as const) {
    const written = createOnceOrSame(paths, join(paths.worker, references[field]), credentials[field]);
    if (!written.ok) return written;
  }
  const kept = Object.freeze({ credentialGeneration: identity.credentialGeneration, credentials: identity.credentials });
  const adopted: WorkerIdentity = Object.freeze({ ...identity, credentialGeneration: generation, credentials: references, previous: kept });
  const replaced = replaceFile(paths.identity, serializeIdentity(adopted));
  return replaced.ok ? ok(adopted) : replaced;
}

// After the confirmation: the identity drops the previous generation, then
// its files and the pending file are removed.
export function finishAdoption(paths: WorkerPaths, identity: WorkerIdentity): Result<WorkerIdentity> {
  const { previous, ...confirmed } = identity;
  if (previous === undefined) return ok(identity);
  const replaced = replaceFile(paths.identity, serializeIdentity(confirmed));
  if (!replaced.ok) return replaced;
  const removed = removeSupersededGeneration(paths, confirmed);
  return removed.ok ? ok(Object.freeze(confirmed)) : removed;
}

// The identity is the durable record of a finished adoption, so every start
// removes the files that a crash after its replacement left behind.
export function removeSupersededGeneration(paths: WorkerPaths, identity: WorkerIdentity): Result<void> {
  const { credentialGeneration, previous } = identity;
  if (previous !== undefined || credentialGeneration === 1) return ok(undefined);
  const superseded = credentialReferencesOf(credentialGeneration - 1);
  const leftovers = [superseded.controlPlane, superseded.broker].map((reference) => join(paths.worker, reference));
  for (const path of [...leftovers, pendingPath(paths, credentialGeneration)]) rmSync(path, { force: true });
  return syncPath(paths.credentials);
}

// A crash may have left the file written; only the same content counts.
function createOnceOrSame(paths: WorkerPaths, path: string, content: string): Result<void> {
  const created = createOnce(path, content);
  if (created.ok || created.error.code !== 'conflict') return created;
  const synced = syncBeforeUse(path);
  if (!synced.ok) return synced;
  const safe = checkControlPath(paths.dataRoot, path, ownerUid());
  if (!safe.ok) return safe;
  return readFileSync(path, 'utf8') === content ? ok(undefined) : err(rootFailure('corrupt', `${path} holds other credentials`, { path }));
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

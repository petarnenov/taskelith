import { existsSync, readFileSync } from 'node:fs';
import { parseIdentifier, err, ok, type Result } from '@taskelith/kernel';
import type { InstallationId, JournalId, WorkerId } from '@taskelith/execution';
import { syncBeforeUse } from '@taskelith/data-root';
import { rootFailure } from './journal-failure.js';

// Where the current generation's credentials are, relative to `worker/`.
export interface CredentialReferences {
  readonly controlPlane: string;
  readonly broker: string;
}

// `worker/identity`: the binding, and the credential generation with the
// references to its files (installation and enrollment contract, item 20).
export interface WorkerIdentity {
  readonly installationId: InstallationId;
  readonly workerId: WorkerId;
  readonly journalId: JournalId;
  readonly credentialGeneration: number;
  readonly credentials: CredentialReferences;
}

export const IDENTITY_FORMAT = 1;

// A reference names one file directly under `worker/credentials/`.
const CREDENTIAL_REFERENCE = /^credentials\/[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/;

export function serializeIdentity(identity: WorkerIdentity): string {
  const { installationId, workerId, journalId, credentialGeneration, credentials } = identity;
  const { controlPlane, broker } = credentials;
  const stored = { format: IDENTITY_FORMAT, installationId, workerId, journalId, credentialGeneration, credentials: { controlPlane, broker } };
  return `${JSON.stringify(stored)}\n`;
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
  const credentials = credentialReferences(stored.credentials);
  const { credentialGeneration } = stored;
  if (!installationId.ok || !workerId.ok || !journalId.ok || credentials === undefined || !isGeneration(credentialGeneration)) {
    return err(rootFailure('corrupt', `the worker identity ${path} has invalid values`, { path }));
  }
  return ok(Object.freeze({
    installationId: installationId.value, workerId: workerId.value, journalId: journalId.value, credentialGeneration, credentials,
  }));
}

function credentialReferences(stored: unknown): CredentialReferences | undefined {
  const { controlPlane, broker } = (stored ?? {}) as Record<string, unknown>;
  if (!isReference(controlPlane) || !isReference(broker)) return undefined;
  return Object.freeze({ controlPlane, broker });
}

function isReference(value: unknown): value is string {
  return typeof value === 'string' && CREDENTIAL_REFERENCE.test(value);
}

function isGeneration(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

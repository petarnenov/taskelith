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

// A generation the worker keeps while its successor is unconfirmed.
export interface KeptGeneration {
  readonly credentialGeneration: number;
  readonly credentials: CredentialReferences;
}

// `worker/identity`: the binding and the current generation's files;
// `previous` only between an adoption and its confirmation (contract sec. 6).
export interface WorkerIdentity {
  readonly installationId: InstallationId;
  readonly workerId: WorkerId;
  readonly journalId: JournalId;
  readonly credentialGeneration: number;
  readonly credentials: CredentialReferences;
  readonly previous?: KeptGeneration;
}

// Format 2 adds `previous`; format 1 is still read.
export const IDENTITY_FORMAT = 2;

// A reference names one file directly under `worker/credentials/`.
const CREDENTIAL_REFERENCE = /^credentials\/[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/;

export function serializeIdentity(identity: WorkerIdentity): string {
  const { installationId, workerId, journalId, credentialGeneration, credentials, previous } = identity;
  const stored = {
    format: IDENTITY_FORMAT, installationId, workerId, journalId, credentialGeneration, credentials: storedReferences(credentials),
    ...(previous === undefined ? {} : {
      previous: { credentialGeneration: previous.credentialGeneration, credentials: storedReferences(previous.credentials) },
    }),
  };
  return `${JSON.stringify(stored)}\n`;
}

function storedReferences({ controlPlane, broker }: CredentialReferences): CredentialReferences {
  return { controlPlane, broker };
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
  const previous = keptGeneration(stored.previous);
  if (!installationId.ok || !workerId.ok || !journalId.ok || credentials === undefined || !isGeneration(credentialGeneration)
    || previous === INVALID || (previous !== undefined && previous.credentialGeneration !== credentialGeneration - 1)) {
    return err(rootFailure('corrupt', `the worker identity ${path} has invalid values`, { path }));
  }
  return ok(Object.freeze({
    installationId: installationId.value, workerId: workerId.value, journalId: journalId.value, credentialGeneration, credentials,
    ...(previous === undefined ? {} : { previous }),
  }));
}

const INVALID = Symbol('invalid');

function keptGeneration(stored: unknown): KeptGeneration | undefined | typeof INVALID {
  if (stored === undefined) return undefined;
  const { credentialGeneration, credentials } = (stored ?? {}) as Record<string, unknown>;
  const references = credentialReferences(credentials);
  if (!isGeneration(credentialGeneration) || references === undefined) return INVALID;
  return Object.freeze({ credentialGeneration, credentials: references });
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

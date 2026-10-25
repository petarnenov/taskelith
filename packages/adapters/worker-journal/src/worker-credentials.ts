import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { err, ok, type Result } from '@taskelith/kernel';
import type { JournalBinding } from '@taskelith/execution';
import { checkControlPath, createOnce, createPrivateDirectory, syncBeforeUse } from '@taskelith/data-root';
import { rootFailure } from './journal-failure.js';
import type { CredentialReferences, WorkerIdentity } from './worker-identity.js';
import { ownerUid, type WorkerPaths } from './worker-paths.js';

// The secrets of one credential generation (installation and enrollment
// contract, section 6): the bearer secret and the `.creds` file's text.
export interface WorkerCredentials {
  readonly controlPlane: string;
  readonly broker: string;
}

// What enrollment returns for the root: the binding and generation 1.
export interface WorkerEnrollment extends JournalBinding {
  readonly credentialGeneration: number;
  readonly credentials: WorkerCredentials;
}

export function credentialReferencesOf(generation: number): CredentialReferences {
  return Object.freeze({ controlPlane: `credentials/control-plane.${generation}`, broker: `credentials/broker.${generation}.creds` });
}

// Each file is created once at mode 0600 by the durable file rule, before
// the identity that references it.
export function writeCredentials(paths: WorkerPaths, enrollment: WorkerEnrollment): Result<CredentialReferences> {
  const references = credentialReferencesOf(enrollment.credentialGeneration);
  if (!existsSync(paths.credentials)) {
    const created = createPrivateDirectory(paths.credentials);
    if (!created.ok) return created;
  }
  for (const field of ['controlPlane', 'broker'] as const) {
    const written = createOnce(join(paths.worker, references[field]), enrollment.credentials[field]);
    if (!written.ok) return written;
  }
  return ok(references);
}

// The identity's credentials, read only through safe control-record paths.
export function readWorkerCredentials(paths: WorkerPaths, identity: WorkerIdentity): Result<WorkerCredentials> {
  const controlPlane = readCredential(paths, identity.credentials.controlPlane);
  if (!controlPlane.ok) return controlPlane;
  const broker = readCredential(paths, identity.credentials.broker);
  return broker.ok ? ok(Object.freeze({ controlPlane: controlPlane.value, broker: broker.value })) : broker;
}

function readCredential(paths: WorkerPaths, reference: string): Result<string> {
  const path = join(paths.worker, reference);
  const safe = checkControlPath(paths.dataRoot, path, ownerUid());
  if (!safe.ok) return safe;
  if (!existsSync(path)) return err(rootFailure('corrupt', `the credential ${reference} the identity names is missing`, { path }));
  const synced = syncBeforeUse(path);
  if (!synced.ok) return synced;
  const content = readFileSync(path, 'utf8');
  return content === '' ? err(rootFailure('corrupt', `the credential ${reference} is empty`, { path })) : ok(content);
}

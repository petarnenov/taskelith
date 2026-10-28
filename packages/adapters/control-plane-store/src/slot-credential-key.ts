import { randomBytes } from 'node:crypto';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { ControlPlaneNamespace } from './control-plane-namespace.js';

export const SLOT_CREDENTIAL_KEY_FILE = 'slot-credential-key';
export const SLOT_CREDENTIAL_KEY_LENGTH = 32;

export type KeySource = () => Uint8Array;

// `control-plane/slot-credential-key`: the key that encrypts slot
// credentials, never in the database (account pool contract section 1).
export function openSlotCredentialKey(namespace: ControlPlaneNamespace, generate: KeySource = newKey): Result<Uint8Array> {
  const stored = readKey(namespace);
  if (!stored.ok || stored.value !== undefined) return stored as Result<Uint8Array>;
  const created = namespace.create(SLOT_CREDENTIAL_KEY_FILE, { key: Buffer.from(generate()).toString('base64') });
  // Another process created it first; its key is the one to use.
  if (!created.ok && created.error.code !== 'conflict') return created;
  const reread = readKey(namespace);
  if (!reread.ok) return reread;
  return reread.value === undefined ? err(malformed()) : ok(reread.value);
}

function readKey(namespace: ControlPlaneNamespace): Result<Uint8Array | undefined> {
  const document = namespace.read(SLOT_CREDENTIAL_KEY_FILE);
  if (!document.ok || document.value === undefined) return document as Result<undefined>;
  const { key } = document.value;
  if (typeof key !== 'string') return err(malformed());
  const bytes = Buffer.from(key, 'base64');
  const canonical = bytes.length === SLOT_CREDENTIAL_KEY_LENGTH && bytes.toString('base64') === key;
  return canonical ? ok(new Uint8Array(bytes)) : err(malformed());
}

// Names the file only, never its content.
function malformed() {
  return failure('precondition-failed', `${SLOT_CREDENTIAL_KEY_FILE} does not hold a ${SLOT_CREDENTIAL_KEY_LENGTH}-byte key`, {
    file: SLOT_CREDENTIAL_KEY_FILE,
  });
}

function newKey(): Uint8Array {
  return randomBytes(SLOT_CREDENTIAL_KEY_LENGTH);
}

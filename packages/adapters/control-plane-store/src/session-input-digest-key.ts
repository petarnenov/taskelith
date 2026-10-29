import { randomBytes } from 'node:crypto';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { ControlPlaneNamespace } from './control-plane-namespace.js';

export const SESSION_INPUT_DIGEST_KEY_FILE = 'session-input-digest.key';
const KEY_BYTES = 32;

// `control-plane/session-input-digest.key`, the HMAC key of the session
// inputs' digests (coordinator answer Q4); no reason quotes the key.
export class SessionInputDigestKeyFile {
  readonly #namespace: ControlPlaneNamespace;

  constructor(namespace: ControlPlaneNamespace) {
    this.#namespace = namespace;
  }

  // Creates a random key once, owner-only; `conflict` when one exists.
  create(): Result<void> {
    return this.#namespace.create(SESSION_INPUT_DIGEST_KEY_FILE, { key: randomBytes(KEY_BYTES).toString('base64') });
  }

  // The stored bytes, whatever their number; the digest checks the size.
  read(): Result<Uint8Array> {
    const stored = this.#namespace.read(SESSION_INPUT_DIGEST_KEY_FILE);
    if (!stored.ok) return stored;
    if (stored.value === undefined) return refused('is missing');
    const { key } = stored.value;
    if (typeof key !== 'string') return refused('has no key');
    const bytes = Buffer.from(key, 'base64');
    return bytes.toString('base64') === key ? ok(new Uint8Array(bytes)) : refused('holds a key that is not base64');
  }
}

function refused(reason: string): Result<never> {
  return err(failure('precondition-failed', `${SESSION_INPUT_DIGEST_KEY_FILE} ${reason}`));
}

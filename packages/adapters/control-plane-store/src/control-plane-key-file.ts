import { randomBytes } from 'node:crypto';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { ControlPlaneNamespace } from './control-plane-namespace.js';

const KEY_BYTES = 32;

// A random 32-byte key in a document of the control-plane namespace, in
// base64 under `key`; no reason quotes the key.
export class ControlPlaneKeyFile {
  readonly #namespace: ControlPlaneNamespace;
  readonly #file: string;

  constructor(namespace: ControlPlaneNamespace, file: string) {
    this.#namespace = namespace;
    this.#file = file;
  }

  // Creates a random key once, owner-only; `conflict` when one exists.
  create(): Result<void> {
    return this.#namespace.create(this.#file, { key: randomBytes(KEY_BYTES).toString('base64') });
  }

  // Creates the key when it is missing and keeps an existing one, whatever
  // it holds, so a rerun never replaces it (coordinator answer Q7 of 13b).
  ensure(): Result<void> {
    const created = this.create();
    return created.ok || created.error.code === 'conflict' ? ok(undefined) : created;
  }

  // The stored bytes, whatever their number; the key's user checks the size.
  read(): Result<Uint8Array> {
    const stored = this.#namespace.read(this.#file);
    if (!stored.ok) return stored;
    if (stored.value === undefined) return this.#refused('is missing; run init');
    const { key } = stored.value;
    if (typeof key !== 'string') return this.#refused('has no key');
    const bytes = Buffer.from(key, 'base64');
    return bytes.toString('base64') === key ? ok(new Uint8Array(bytes)) : this.#refused('holds a key that is not base64');
  }

  #refused(reason: string): Result<never> {
    return err(failure('precondition-failed', `${this.#file} ${reason}`));
  }
}

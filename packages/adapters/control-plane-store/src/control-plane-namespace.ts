import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkControlPath, createOnce, createPrivateDirectory, refuseCheckout, replaceFile, syncBeforeUse } from '@taskelith/data-root';
import { err, failure, ok, type Result } from '@taskelith/kernel';

export const CONTROL_PLANE_DIRECTORY = 'control-plane';
export const DOCUMENT_FORMAT = 1;

export interface NamespaceOptions {
  readonly dataRoot: string;
  readonly ownerUid: number;
}

// The control plane's subtree of the data root (storage contract): private
// directories and files of the owning account, no symbolic links, never in
// a Git checkout, and beside the worker subtree a colocated worker owns.
export class ControlPlaneNamespace {
  readonly directory: string;
  readonly #options: NamespaceOptions;

  private constructor(options: NamespaceOptions) {
    this.#options = options;
    this.directory = join(options.dataRoot, CONTROL_PLANE_DIRECTORY);
  }

  // Creates the data root and the subtree if missing, after checking them.
  static open(options: NamespaceOptions): Result<ControlPlaneNamespace> {
    const namespace = new ControlPlaneNamespace(options);
    const outside = refuseCheckout(options.dataRoot);
    if (!outside.ok) return outside;
    for (const directory of [options.dataRoot, namespace.directory]) {
      const safe = checkControlPath(options.dataRoot, directory, options.ownerUid);
      if (!safe.ok) return safe;
      if (existsSync(directory)) continue;
      const created = createPrivateDirectory(directory);
      if (!created.ok) return created;
    }
    return ok(namespace);
  }

  // A versioned JSON document; one of an unknown newer format is refused.
  read(name: string): Result<Readonly<Record<string, unknown>> | undefined> {
    const path = this.#path(name);
    if (!path.ok) return path;
    if (!existsSync(path.value)) return ok(undefined);
    const synced = syncBeforeUse(path.value);
    if (!synced.ok) return synced;
    let stored: unknown;
    try {
      stored = JSON.parse(readFileSync(path.value, 'utf8'));
    } catch {
      return err(failure('precondition-failed', `${path.value} is not JSON`, { path: path.value }));
    }
    if (typeof stored !== 'object' || stored === null || (stored as { format?: unknown }).format !== DOCUMENT_FORMAT) {
      return err(failure('precondition-failed', `${path.value} has an unsupported format`, { path: path.value }));
    }
    return ok(Object.freeze(stored as Record<string, unknown>));
  }

  // Fails with `conflict` when the document exists.
  create(name: string, fields: Readonly<Record<string, unknown>>): Result<void> {
    const path = this.#path(name);
    return path.ok ? createOnce(path.value, `${JSON.stringify({ format: DOCUMENT_FORMAT, ...fields })}\n`) : path;
  }

  // A generated text file, such as a configuration fragment, written anew.
  writeText(name: string, content: string): Result<string> {
    const path = this.#path(name);
    if (!path.ok) return path;
    const written = replaceFile(path.value, content);
    return written.ok ? ok(path.value) : written;
  }

  #path(name: string): Result<string> {
    if (!/^[a-z][a-z0-9.-]*$/.test(name)) return err(failure('invalid', `${name} is not a control-plane file name`));
    const path = join(this.directory, name);
    const safe = checkControlPath(this.#options.dataRoot, path, this.#options.ownerUid);
    return safe.ok ? ok(path) : safe;
  }
}

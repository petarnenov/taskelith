import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  checkControlPath,
  createOnce,
  createPrivateDirectory,
  dataRootFailure,
  refuseCheckout,
  replaceFile,
  syncBeforeUse,
} from '@taskelith/data-root';
import { err, failure, ok, type Result } from '@taskelith/kernel';

export const CONTROL_PLANE_DIRECTORY = 'control-plane';
export const DOCUMENT_FORMAT = 1;
// The subtree holds signing seeds, so nobody but the owner may even read it.
const GROUP_OR_OTHER_ACCESS = 0o077;

export interface NamespaceOptions {
  readonly dataRoot: string;
  readonly ownerUid: number;
}

// The control plane's private subtree of the data root (storage contract):
// owner-only, no symbolic links, outside a Git checkout, beside `worker/`.
export class ControlPlaneNamespace {
  readonly directory: string;
  readonly #options: NamespaceOptions;

  private constructor(options: NamespaceOptions) {
    this.#options = options;
    this.directory = join(options.dataRoot, CONTROL_PLANE_DIRECTORY);
  }

  // Creates the data root, its missing parents, and the subtree, privately,
  // after checking them.
  static open(options: NamespaceOptions): Result<ControlPlaneNamespace> {
    const namespace = new ControlPlaneNamespace(options);
    const outside = refuseCheckout(options.dataRoot);
    if (!outside.ok) return outside;
    const parents = createMissingParents(options.dataRoot);
    if (!parents.ok) return parents;
    for (const directory of [options.dataRoot, namespace.directory]) {
      const safe = checkControlPath(options.dataRoot, directory, options.ownerUid);
      if (!safe.ok) return safe;
      if (existsSync(directory)) continue;
      const created = createPrivateDirectory(directory);
      if (!created.ok) return created;
    }
    const privateCheck = checkPrivate(namespace.directory, 'directory');
    return privateCheck.ok ? ok(namespace) : privateCheck;
  }

  // A versioned JSON document; one of an unknown newer format is refused.
  read(name: string): Result<Readonly<Record<string, unknown>> | undefined> {
    const path = this.#path(name);
    if (!path.ok) return path;
    if (!existsSync(path.value)) return ok(undefined);
    const privateCheck = checkPrivate(path.value, 'file');
    if (!privateCheck.ok) return privateCheck;
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

  // A text file such as a PEM certificate; undefined when it is absent.
  readText(name: string): Result<string | undefined> {
    const path = this.#path(name);
    if (!path.ok) return path;
    if (!existsSync(path.value)) return ok(undefined);
    const privateCheck = checkPrivate(path.value, 'file');
    if (!privateCheck.ok) return privateCheck;
    const synced = syncBeforeUse(path.value);
    return synced.ok ? ok(readFileSync(path.value, 'utf8')) : synced;
  }

  #path(name: string): Result<string> {
    if (!/^[a-z][a-z0-9.-]*$/.test(name)) return err(failure('invalid', `${name} is not a control-plane file name`));
    const path = join(this.directory, name);
    const safe = checkControlPath(this.#options.dataRoot, path, this.#options.ownerUid);
    return safe.ok ? ok(path) : safe;
  }
}

// A private directory or regular file: no access for group or others.
function checkPrivate(path: string, kind: 'directory' | 'file'): Result<void> {
  const status = lstatSync(path);
  const isKind = kind === 'directory' ? status.isDirectory() : status.isFile();
  if (!isKind) return err(dataRootFailure('unsafe-path', `${path} is not a ${kind}`, { path }));
  if ((status.mode & GROUP_OR_OTHER_ACCESS) !== 0) {
    return err(dataRootFailure('unsafe-path', `${path} is accessible to group or others`, { path }));
  }
  return ok(undefined);
}

// A default root such as `~/.local/share/taskelith` may lack its parents on a
// fresh account; each missing one is created owner-only, from the top.
function createMissingParents(dataRoot: string): Result<void> {
  const missing: string[] = [];
  for (let parent = dirname(dataRoot); !existsSync(parent) && dirname(parent) !== parent; parent = dirname(parent)) {
    missing.unshift(parent);
  }
  for (const directory of missing) {
    const created = createPrivateDirectory(directory);
    if (!created.ok) return created;
  }
  return ok(undefined);
}

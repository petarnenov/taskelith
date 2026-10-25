import { createHash } from 'node:crypto';
import { constants, existsSync, lstatSync, readdirSync } from 'node:fs';
import { open as openFile, unlink, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { CONTROL_PLANE_DIRECTORY } from '@taskelith/control-plane-store';
import {
  checkControlPath,
  createOnceAsync,
  createPrivateDirectory,
  dataRootFailure,
  removeTemporaries,
  replaceFileAsync,
  syncPathAsync,
} from '@taskelith/data-root';
import type { EvidenceStore } from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { ContentDigest } from '@taskelith/sdlc';

export const EVIDENCE_DIRECTORY = 'evidence';
const SHA256_PREFIX = 'sha256:';

export interface VolumeOptions {
  readonly dataRoot: string;
  readonly ownerUid: number;
}

// Evidence content on a durable local volume (architecture section 8): one
// owner-only file per digest under `control-plane/evidence/sha256/<xx>/`.
export class LocalEvidenceVolume implements EvidenceStore {
  readonly directory: string;
  readonly #options: VolumeOptions;

  private constructor(options: VolumeOptions) {
    this.#options = options;
    this.directory = join(options.dataRoot, CONTROL_PLANE_DIRECTORY, EVIDENCE_DIRECTORY);
  }

  // The control-plane namespace must already exist; the evidence subtree is
  // created inside it, and temporaries a crash left behind are removed.
  static open(options: VolumeOptions): Result<LocalEvidenceVolume> {
    const volume = new LocalEvidenceVolume(options);
    const namespace = join(options.dataRoot, CONTROL_PLANE_DIRECTORY);
    if (!existsSync(namespace)) return err(failure('precondition-failed', `${namespace} does not exist`, { path: namespace }));
    for (const directory of [volume.directory, volume.#algorithmDirectory()]) {
      const prepared = volume.#ensureDirectory(directory);
      if (!prepared.ok) return prepared;
    }
    for (const shard of readdirSync(volume.#algorithmDirectory())) {
      const path = join(volume.#algorithmDirectory(), shard);
      const safe = volume.#checkDirectory(path);
      if (!safe.ok) return safe;
      removeTemporaries(path);
    }
    return ok(volume);
  }

  // Content is read and written without blocking the event loop; a path
  // that fails its safety checks is a volume defect, so `internal`.
  async put(digest: ContentDigest, content: Uint8Array): Promise<Result<void>> {
    return asStoreResult(await this.#put(digest, content));
  }

  async read(digest: ContentDigest): Promise<Result<Uint8Array>> {
    return asStoreResult(await this.#readVerified(digest, this.#contentPath(digest)));
  }

  async remove(digest: ContentDigest): Promise<Result<void>> {
    const path = this.#contentPath(digest);
    const safe = checkControlPath(this.#options.dataRoot, path, this.#options.ownerUid);
    if (!safe.ok) return asStoreResult(safe);
    if (!existsSync(path)) return ok(undefined);
    await unlink(path);
    return syncPathAsync(this.#shardDirectory(digest));
  }

  async #put(digest: ContentDigest, content: Uint8Array): Promise<Result<void>> {
    if (digestOf(content) !== digest) return err(failure('invalid', `the content does not match ${digest}`, { digest }));
    const shard = this.#ensureDirectory(this.#shardDirectory(digest));
    if (!shard.ok) return shard;
    const path = this.#contentPath(digest);
    if (!existsSync(path)) {
      const created = await createOnceAsync(path, content);
      // A concurrent writer may place the same digest first.
      if (created.ok || created.error.code !== 'conflict') return created;
    }
    return this.#keepOrRepair(digest, path, content);
  }

  // An intact copy is kept; republishing the exact content repairs a
  // corrupt one.
  async #keepOrRepair(digest: ContentDigest, path: string, content: Uint8Array): Promise<Result<void>> {
    const stored = await this.#readVerified(digest, path);
    if (stored.ok) return ok(undefined);
    return stored.error.details.reason === 'evidence-corrupt' ? replaceFileAsync(path, content) : stored;
  }

  async #readVerified(digest: ContentDigest, path: string): Promise<Result<Uint8Array>> {
    const safe = checkControlPath(this.#options.dataRoot, path, this.#options.ownerUid);
    if (!safe.ok) return safe;
    const handle = await openNoFollow(path);
    if (!handle.ok) return handle.error.code === 'not-found' ? err(failure('not-found', `no evidence content ${digest}`, { digest })) : handle;
    try {
      if (!(await handle.value.stat()).isFile()) return err(dataRootFailure('unsafe-path', `${path} is not a file`, { path }));
      const content = await handle.value.readFile();
      if (digestOf(content) === digest) return ok(content);
      return err(failure('internal', `evidence content ${digest} is corrupt`, { digest, reason: 'evidence-corrupt' }));
    } finally {
      await handle.value.close();
    }
  }

  #ensureDirectory(path: string): Result<void> {
    const safe = this.#checkDirectory(path);
    if (!safe.ok || existsSync(path)) return safe;
    const created = createPrivateDirectory(path);
    // Another publication may create the same shard at the same time.
    return created.ok || created.error.code !== 'conflict' ? created : this.#checkDirectory(path);
  }

  #checkDirectory(path: string): Result<void> {
    const safe = checkControlPath(this.#options.dataRoot, path, this.#options.ownerUid);
    if (!safe.ok || !existsSync(path) || lstatSync(path).isDirectory()) return safe;
    return err(dataRootFailure('unsafe-path', `${path} is not a directory`, { path }));
  }

  #algorithmDirectory(): string {
    return join(this.directory, 'sha256');
  }

  #shardDirectory(digest: ContentDigest): string {
    return join(this.#algorithmDirectory(), hexOf(digest).slice(0, 2));
  }

  #contentPath(digest: ContentDigest): string {
    return join(this.#shardDirectory(digest), hexOf(digest));
  }
}

// O_NOFOLLOW closes the gap between the path check and the open: a link
// placed there meanwhile fails the open instead of being followed.
async function openNoFollow(path: string): Promise<Result<FileHandle>> {
  try {
    return ok(await openFile(path, constants.O_RDONLY | constants.O_NOFOLLOW));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return err(failure('not-found', `${path} does not exist`, { path }));
    if (code === 'ELOOP') return err(dataRootFailure('unsafe-path', `${path} is a symbolic link`, { path }));
    throw error;
  }
}

function asStoreResult<Value>(result: Result<Value>): Result<Value> {
  if (result.ok || result.error.code !== 'forbidden') return result;
  return err(failure('internal', result.error.message, result.error.details));
}

function hexOf(digest: ContentDigest): string {
  return digest.slice(SHA256_PREFIX.length);
}

function digestOf(content: Uint8Array): string {
  return `${SHA256_PREFIX}${createHash('sha256').update(content).digest('hex')}`;
}

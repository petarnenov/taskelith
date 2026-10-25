import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { CONTROL_PLANE_DIRECTORY } from '@taskelith/control-plane-store';
import {
  checkControlPath,
  createOnce,
  createPrivateDirectory,
  dataRootFailure,
  removeTemporaries,
  replaceFile,
  syncPath,
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

// Evidence content on a durable local volume (architecture section 8):
// `control-plane/evidence/sha256/<first two hex>/<hex>`, one owner-only
// file per digest, written by the durable file rule and never changed.
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

  async put(digest: ContentDigest, content: Uint8Array): Promise<Result<void>> {
    if (digestOf(content) !== digest) return err(failure('invalid', `the content does not match ${digest}`, { digest }));
    const shard = this.#ensureDirectory(this.#shardDirectory(digest));
    if (!shard.ok) return shard;
    const path = this.#contentPath(digest);
    if (!existsSync(path)) {
      const created = createOnce(path, content);
      // A concurrent writer may place the same digest first.
      if (created.ok || created.error.code !== 'conflict') return created;
    }
    return this.#keepOrRepair(digest, path, content);
  }

  async read(digest: ContentDigest): Promise<Result<Uint8Array>> {
    return this.#readVerified(digest, this.#contentPath(digest));
  }

  async remove(digest: ContentDigest): Promise<Result<void>> {
    const path = this.#contentPath(digest);
    const safe = checkControlPath(this.#options.dataRoot, path, this.#options.ownerUid);
    if (!safe.ok) return safe;
    if (!existsSync(path)) return ok(undefined);
    rmSync(path);
    return syncPath(this.#shardDirectory(digest));
  }

  // An intact copy is kept; republishing the exact content repairs a
  // corrupt one.
  #keepOrRepair(digest: ContentDigest, path: string, content: Uint8Array): Result<void> {
    const stored = this.#readVerified(digest, path);
    if (stored.ok) return ok(undefined);
    return stored.error.details.reason === 'evidence-corrupt' ? replaceFile(path, content) : stored;
  }

  #readVerified(digest: ContentDigest, path: string): Result<Uint8Array> {
    const safe = checkControlPath(this.#options.dataRoot, path, this.#options.ownerUid);
    if (!safe.ok) return safe;
    if (!existsSync(path)) return err(failure('not-found', `no evidence content ${digest}`, { digest }));
    if (!lstatSync(path).isFile()) return err(dataRootFailure('unsafe-path', `${path} is not a file`, { path }));
    const content = readFileSync(path);
    if (digestOf(content) === digest) return ok(content);
    return err(failure('internal', `evidence content ${digest} is corrupt`, { digest, reason: 'evidence-corrupt' }));
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

function hexOf(digest: ContentDigest): string {
  return digest.slice(SHA256_PREFIX.length);
}

function digestOf(content: Uint8Array): string {
  return `${SHA256_PREFIX}${createHash('sha256').update(content).digest('hex')}`;
}

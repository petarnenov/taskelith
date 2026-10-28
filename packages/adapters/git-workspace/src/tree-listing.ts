import type { Result } from '@taskelith/kernel';
import type { GitTreeEntry } from '@taskelith/workspace';

export type ListedEntry =
  | { readonly type: 'blob'; readonly mode: '100644' | '100755' | '120000'; readonly object: string; readonly path: Uint8Array }
  | { readonly type: 'gitlink'; readonly object: string; readonly path: Uint8Array };

export function parseTreeListing(_output: Uint8Array): Result<readonly ListedEntry[]> {
  throw new Error('not implemented');
}

export function parseBatchObjects(_output: Uint8Array): Result<ReadonlyMap<string, Uint8Array>> {
  throw new Error('not implemented');
}

export function snapshotTree(_entries: readonly ListedEntry[], _objects: ReadonlyMap<string, Uint8Array>): Result<ReadonlyMap<string, GitTreeEntry>> {
  throw new Error('not implemented');
}

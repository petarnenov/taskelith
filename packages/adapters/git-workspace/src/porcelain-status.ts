import type { Result } from '@taskelith/kernel';

export type StatusEntryKind = 'changed' | 'renamed' | 'unmerged' | 'untracked' | 'ignored';

export interface StatusEntry {
  readonly kind: StatusEntryKind;
  readonly path: Uint8Array;
}

export interface PorcelainStatus {
  readonly commit: string | null;
  readonly branch: string | null;
  readonly entries: readonly StatusEntry[];
}

export function parsePorcelainStatus(_output: Uint8Array): Result<PorcelainStatus> {
  throw new Error('not implemented');
}

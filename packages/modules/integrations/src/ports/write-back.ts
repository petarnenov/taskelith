import type { Result } from '@taskelith/kernel';

// Plugin-facing plain data. A repeat with the same idempotency key is a no-op
// at the source; a failure is retried and never blocks a gate or a merge.
export interface SourceItemRef {
  readonly projectId: string;
  readonly sourceKind: string;
  readonly externalId: string;
  readonly idempotencyKey: string;
}

export interface ProgressReport extends SourceItemRef {
  readonly column: string;
  readonly gate?: string;
}

export interface ChangeRequestLink extends SourceItemRef {
  readonly link: string;
}

export interface SourceResolution extends SourceItemRef {
  readonly integratedRevision: string;
}

export interface WriteBack {
  reportProgress(report: ProgressReport): Promise<Result<void>>;
  linkChangeRequest(link: ChangeRequestLink): Promise<Result<void>>;
  resolve(resolution: SourceResolution): Promise<Result<void>>;
}

import { ok, type Result } from '@taskelith/kernel';
import type { ArtifactId, ArtifactRevision } from '../domain/artifact-revision.js';
import type { WorkflowRunId } from '../domain/workflow-run.js';
import type { CurrentRevisions } from '../ports/current-revisions.js';

export class InMemoryCurrentRevisions implements CurrentRevisions {
  readonly #revisions = new Map<string, ArtifactRevision>();

  async seed(runId: WorkflowRunId, revisions: readonly ArtifactRevision[]): Promise<Result<void>> {
    for (const revision of revisions) {
      const key = keyOf(runId, revision.artifactId);
      if (!this.#revisions.has(key)) this.#revisions.set(key, revision);
    }
    return ok(undefined);
  }

  async current(runId: WorkflowRunId, artifactIds: readonly ArtifactId[]): Promise<Result<readonly ArtifactRevision[]>> {
    const known = artifactIds.map((artifactId) => this.#revisions.get(keyOf(runId, artifactId)));
    return ok(known.filter((revision) => revision !== undefined));
  }
}

function keyOf(runId: WorkflowRunId, artifactId: ArtifactId): string {
  return JSON.stringify([runId, artifactId]);
}

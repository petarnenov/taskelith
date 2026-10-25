import type { Result } from '@taskelith/kernel';
import type { ArtifactId, ArtifactRevision } from '../domain/artifact-revision.js';
import type { WorkflowRunId } from '../domain/workflow-run.js';

// The current revision of each artifact of a run, which a launch compares
// its admission's bound revisions with (launch authorization section 9).
export interface CurrentRevisions {
  // Records each revision whose artifact has none in the run yet; a known
  // artifact keeps its revision, whichever one is given.
  seed(runId: WorkflowRunId, revisions: readonly ArtifactRevision[]): Promise<Result<void>>;
  // The recorded revisions of those artifacts; an unknown one is absent.
  current(runId: WorkflowRunId, artifactIds: readonly ArtifactId[]): Promise<Result<readonly ArtifactRevision[]>>;
}

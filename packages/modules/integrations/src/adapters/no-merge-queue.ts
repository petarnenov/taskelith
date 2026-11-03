import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { ProjectId, WorkflowRunId } from '@taskelith/sdlc';
import type { MergeClaim, MergeQueue, MergeRequest } from '../ports/auto-merge.js';

// The merge queue until item 23 builds it: it holds no request and never
// reports a merge, so the board's merge gate follows readiness alone.
export class NoMergeQueue implements MergeQueue {
  async enqueue(): Promise<Result<MergeRequest>> {
    return notBuilt();
  }

  async claimNext(_projectId: ProjectId): Promise<Result<MergeClaim>> {
    return ok(Object.freeze({ outcome: 'queue-empty' as const }));
  }

  async transition(): Promise<Result<MergeRequest>> {
    return err(failure('not-found', 'the merge queue holds no request'));
  }

  async latestForRun(runId: WorkflowRunId): Promise<Result<MergeRequest>> {
    return err(failure('not-found', `run ${runId} has no merge request`));
  }

  async recordManualMerge(): Promise<Result<MergeRequest>> {
    return notBuilt();
  }
}

function notBuilt(): Result<never> {
  return err(failure('unavailable', 'the merge queue is not built yet (G3 item 23)'));
}

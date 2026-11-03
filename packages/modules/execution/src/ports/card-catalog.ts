import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import type { ProjectId, TaskId, WorkflowRunId } from '@taskelith/sdlc';
import { WORK_TYPES, type WorkType } from '../domain/task-defaults.js';

export const MAX_CARD_TITLE_LENGTH = 200;

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;
// An unpaired surrogate, which UTF-8 text in PostgreSQL cannot keep.
const UNPAIRED_SURROGATE = /\p{Cs}/u;

// A card's own data (product ports section 3.3), which task intake writes;
// a run without one is not a card.
export interface CardRecord {
  readonly runId: WorkflowRunId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly workType: WorkType;
  readonly createdAt: Instant;
}

// A task of a card: a task of its run, or a delegated child of one.
export interface CardTask {
  readonly taskId: TaskId;
  readonly taskRunId: WorkflowRunId;
  readonly parentTaskId?: TaskId;
  readonly depth: number;
}

// Registering a run twice is `conflict`; a project's cards list oldest
// first, then by run identifier.
export interface CardCatalog {
  register(card: CardRecord): Promise<Result<void>>;
  get(runId: WorkflowRunId): Promise<Result<CardRecord | undefined>>;
  listByProject(projectId: ProjectId): Promise<Result<readonly CardRecord[]>>;
  // In admission order, each delegated child under its parent.
  tasks(runId: WorkflowRunId): Promise<Result<readonly CardTask[]>>;
}

export function parseCardRecord(card: CardRecord): Result<CardRecord> {
  const { title, workType } = card;
  if (title.length === 0 || [...title].length > MAX_CARD_TITLE_LENGTH || CONTROL_CHARACTER.test(title) || UNPAIRED_SURROGATE.test(title)) {
    return err(failure('invalid', `a card title is 1 to ${MAX_CARD_TITLE_LENGTH} characters without control characters or unpaired surrogates`));
  }
  if (!WORK_TYPES.includes(workType)) return err(failure('invalid', `${String(workType)} is not a work type`));
  return ok(Object.freeze({ ...card }));
}

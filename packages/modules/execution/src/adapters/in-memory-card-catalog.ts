import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { ProjectId, TaskId, WorkflowRunId } from '@taskelith/sdlc';
import { parseCardRecord, type CardCatalog, type CardRecord, type CardTask } from '../ports/card-catalog.js';

interface AdmittedTask {
  readonly task: CardTask;
  readonly path: readonly number[];
}

export class InMemoryCardCatalog implements CardCatalog {
  readonly #cards = new Map<WorkflowRunId, CardRecord>();
  readonly #admitted = new Map<TaskId, AdmittedTask>();

  async register(card: CardRecord): Promise<Result<void>> {
    const parsed = parseCardRecord(card);
    if (!parsed.ok) return parsed;
    if (this.#cards.has(card.runId)) return err(failure('conflict', `run ${card.runId} is already a card`));
    this.#cards.set(card.runId, parsed.value);
    return ok(undefined);
  }

  async get(runId: WorkflowRunId): Promise<Result<CardRecord | undefined>> {
    return ok(this.#cards.get(runId));
  }

  async listByProject(projectId: ProjectId): Promise<Result<readonly CardRecord[]>> {
    const cards = [...this.#cards.values()].filter((card) => card.projectId === projectId);
    return ok(Object.freeze(cards.sort(cardOrder)));
  }

  // Admits a task, in the order of the calls, as a task INSERT of
  // PostgreSQL takes the next admission sequence value.
  async admit(task: CardTask): Promise<Result<void>> {
    if (this.#admitted.has(task.taskId)) return err(failure('conflict', `task ${task.taskId} is already admitted`));
    const parent = task.parentTaskId === undefined ? [] : this.#admitted.get(task.parentTaskId)?.path;
    if (parent === undefined) return err(failure('not-found', `the parent of task ${task.taskId} is unknown`));
    this.#admitted.set(task.taskId, Object.freeze({ task: Object.freeze({ ...task }), path: Object.freeze([...parent, this.#admitted.size]) }));
    return ok(undefined);
  }

  // The path of admissions from the root orders the lineage, as in PG.
  async tasks(runId: WorkflowRunId): Promise<Result<readonly CardTask[]>> {
    if (!this.#cards.has(runId)) return ok(Object.freeze([]));
    const lineage = [...this.#admitted.values()].filter((each) => this.#rootOf(each.task).taskRunId === runId);
    return ok(Object.freeze(lineage.sort((left, right) => pathOrder(left.path, right.path)).map((each) => each.task)));
  }

  // `admit` keeps every parent of an admitted task.
  #rootOf(task: CardTask): CardTask {
    return task.parentTaskId === undefined ? task : this.#rootOf(this.#admitted.get(task.parentTaskId)!.task);
  }
}

function pathOrder(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index]! - right[index]!;
  }
  return left.length - right.length;
}

export function cardOrder(left: CardRecord, right: CardRecord): number {
  const byTime = Date.parse(left.createdAt) - Date.parse(right.createdAt);
  if (byTime !== 0) return byTime;
  return left.runId < right.runId ? -1 : left.runId > right.runId ? 1 : 0;
}

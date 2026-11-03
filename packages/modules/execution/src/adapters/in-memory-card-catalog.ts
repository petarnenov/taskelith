import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { ProjectId, WorkflowRunId } from '@taskelith/sdlc';
import { parseCardRecord, type CardCatalog, type CardRecord } from '../ports/card-catalog.js';

export class InMemoryCardCatalog implements CardCatalog {
  readonly #cards = new Map<WorkflowRunId, CardRecord>();

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
}

export function cardOrder(left: CardRecord, right: CardRecord): number {
  const byTime = Date.parse(left.createdAt) - Date.parse(right.createdAt);
  if (byTime !== 0) return byTime;
  return left.runId < right.runId ? -1 : left.runId > right.runId ? 1 : 0;
}

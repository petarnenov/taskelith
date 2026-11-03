import { projectScope, type PlacementObstacle, type UiEventOutbox, type UiEventRecord } from '@taskelith/execution';
import { ok, type Instant, type Result } from '@taskelith/kernel';
import type { ProjectId, WorkflowRunId } from '@taskelith/sdlc';
import type { BoardReads } from './board-reads.js';
import { CardReader, type CardView, type CardViewParts } from './card-views.js';

export const PROJECTION_BATCH = 100;

// The cards that a batch of touches names, and whether a worker changed.
export interface TouchedCards {
  readonly touches: number;
  readonly runIds: readonly WorkflowRunId[];
  readonly workersChanged: boolean;
}

// The projector's own state: the touches it consumes, and what each card's
// and each board's last event carried.
export interface CardProjections {
  take(limit: number): Promise<Result<TouchedCards>>;
  lastCard(runId: WorkflowRunId): Promise<Result<string | undefined>>;
  recordCard(runId: WorkflowRunId, projection: string): Promise<Result<void>>;
  lastWorkersOnline(projectId: ProjectId): Promise<Result<number | undefined>>;
  recordWorkersOnline(projectId: ProjectId, workersOnline: number): Promise<Result<void>>;
  projectIds(): Promise<Result<readonly ProjectId[]>>;
}

export interface ProjectionTransaction extends BoardReads {
  readonly projections: CardProjections;
  readonly outbox: UiEventOutbox;
}

// SERIALIZABLE: the touches, the reads, and the events commit together.
export interface ProjectionStore {
  transaction<Value>(work: (transaction: ProjectionTransaction) => Promise<Result<Value>>): Promise<Result<Value>>;
}

// Wire contracts section 10: `card-changed` and `board-changed` carry what
// the reads return at the projection's commit, once per change.
export class CardProjector {
  readonly #store: ProjectionStore;
  readonly #parts: CardViewParts;

  constructor(store: ProjectionStore, parts: CardViewParts) {
    this.#store = store;
    this.#parts = parts;
  }

  // Projects every pending touch, a batch per transaction; answers how many.
  async project(): Promise<Result<number>> {
    let total = 0;
    for (;;) {
      const projected = await this.#store.transaction((transaction) => this.#batch(transaction));
      if (!projected.ok) return projected;
      total += projected.value;
      if (projected.value < PROJECTION_BATCH) return ok(total);
    }
  }

  async #batch(transaction: ProjectionTransaction): Promise<Result<number>> {
    const touched = await transaction.projections.take(PROJECTION_BATCH);
    if (!touched.ok || touched.value.touches === 0) return touched.ok ? ok(0) : touched;
    const at = await transaction.now();
    const reader = new CardReader(transaction, this.#parts, at);
    for (const runId of touched.value.runIds) {
      const projected = await this.#projectCard(transaction, reader, runId, at);
      if (!projected.ok) return projected;
    }
    if (touched.value.workersChanged) {
      const boards = await this.#projectBoards(transaction, reader, at);
      if (!boards.ok) return boards;
    }
    return ok(touched.value.touches);
  }

  async #projectCard(transaction: ProjectionTransaction, reader: CardReader, runId: WorkflowRunId, at: Instant): Promise<Result<void>> {
    const record = await transaction.cards.get(runId);
    if (!record.ok || record.value === undefined) return record.ok ? ok(undefined) : record;
    const view = await reader.view(record.value);
    if (!view.ok) return view;
    const projection = projectionKey(view.value);
    const last = await transaction.projections.lastCard(runId);
    if (!last.ok || last.value === projection) return last.ok ? ok(undefined) : last;
    const appended = await append(transaction.outbox, record.value.projectId, { type: 'card-changed', card: view.value.card }, at);
    return appended.ok ? transaction.projections.recordCard(runId, projection) : appended;
  }

  async #projectBoards(transaction: ProjectionTransaction, reader: CardReader, at: Instant): Promise<Result<void>> {
    const online = await reader.workersOnline();
    if (!online.ok) return online;
    const projects = await transaction.projections.projectIds();
    if (!projects.ok) return projects;
    for (const projectId of projects.value) {
      const last = await transaction.projections.lastWorkersOnline(projectId);
      if (!last.ok) return last;
      if (last.value === online.value) continue;
      const appended = await append(transaction.outbox, projectId, { type: 'board-changed', workersOnline: online.value }, at);
      if (!appended.ok) return appended;
      const recorded = await transaction.projections.recordWorkersOnline(projectId, online.value);
      if (!recorded.ok) return recorded;
    }
    return ok(undefined);
  }
}

// The card and its task detail (wire contracts section 8, "Cards"); a fleet
// obstacle is observed at each read's time, which alone is no change.
function projectionKey(view: CardView): string {
  return JSON.stringify({ ...view, card: withoutFleetTime(view.card), tasks: view.tasks.map(withoutFleetTime) });
}

function withoutFleetTime(shown: { readonly obstacle?: PlacementObstacle }): object {
  if (shown.obstacle?.source !== 'fleet') return shown;
  const { observedAt: _observedAt, ...obstacle } = shown.obstacle;
  return { ...shown, obstacle };
}

function append(outbox: UiEventOutbox, projectId: ProjectId, record: UiEventRecord, at: Instant): Promise<Result<void>> {
  return outbox.append({ scope: projectScope(projectId), occurredAt: at, record });
}

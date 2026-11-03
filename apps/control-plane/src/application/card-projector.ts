import { projectScope, type PlacementObstacle, type UiEventOutbox, type UiEventRecord } from '@taskelith/execution';
import { ok, type Instant, type Result } from '@taskelith/kernel';
import type { ProjectId, WorkflowRunId } from '@taskelith/sdlc';
import type { BoardReads } from './board-reads.js';
import { CardReader, type CardView, type CardViewParts } from './card-views.js';

export const PROJECTION_BATCH = 100;

// The last touch that a pass projects; later ones wait for the next pass.
export type TouchHorizon = string;

// The broad touches turned into one touch per card they name.
export interface ExpandedTouches {
  readonly touches: number;
  readonly through: TouchHorizon;
  readonly workersChanged: boolean;
}

// The cards that a batch of card-sized touches names.
export interface TouchedCards {
  readonly touches: number;
  readonly runIds: readonly WorkflowRunId[];
}

// The projector's own state: the touches it consumes, and what each card's
// and each board's last event carried.
export interface CardProjections {
  expand(): Promise<Result<ExpandedTouches>>;
  take(limit: number, through: TouchHorizon): Promise<Result<TouchedCards>>;
  // Touches the cards again, so the next pass projects them.
  retry(runIds: readonly WorkflowRunId[]): Promise<Result<void>>;
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

// The touches a pass consumed, and the cards whose read failed, which stay
// touched for the next pass.
export interface ProjectionPass {
  readonly touches: number;
  readonly skipped: readonly WorkflowRunId[];
}

interface BatchResult extends TouchedCards {
  readonly skipped: readonly WorkflowRunId[];
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

  // Expands the broad touches, then projects at most a batch of cards per
  // transaction, through the last touch the expansion saw.
  async project(): Promise<Result<ProjectionPass>> {
    const expanded = await this.#store.transaction((transaction) => this.#expand(transaction));
    if (!expanded.ok) return expanded;
    let touches = expanded.value.touches;
    const skipped = new Set<WorkflowRunId>();
    for (;;) {
      const batch = await this.#store.transaction((transaction) => this.#batch(transaction, expanded.value.through));
      if (!batch.ok) return batch;
      touches += batch.value.touches;
      for (const runId of batch.value.skipped) skipped.add(runId);
      if (batch.value.touches < PROJECTION_BATCH) return ok(Object.freeze({ touches, skipped: Object.freeze([...skipped]) }));
    }
  }

  async #expand(transaction: ProjectionTransaction): Promise<Result<ExpandedTouches>> {
    const expanded = await transaction.projections.expand();
    if (!expanded.ok || !expanded.value.workersChanged) return expanded;
    const at = await transaction.now();
    const boards = await this.#projectBoards(transaction, new CardReader(transaction, this.#parts, at), at);
    return boards.ok ? expanded : boards;
  }

  async #batch(transaction: ProjectionTransaction, through: TouchHorizon): Promise<Result<BatchResult>> {
    const touched = await transaction.projections.take(PROJECTION_BATCH, through);
    if (!touched.ok || touched.value.touches === 0) return touched.ok ? ok({ ...touched.value, skipped: [] }) : touched;
    const at = await transaction.now();
    const reader = new CardReader(transaction, this.#parts, at);
    const skipped: WorkflowRunId[] = [];
    for (const runId of touched.value.runIds) {
      const projected = await this.#projectCard(transaction, reader, runId, at);
      if (!projected.ok) return projected;
      if (projected.value === 'unreadable') skipped.push(runId);
    }
    const retried = skipped.length === 0 ? ok(undefined) : await transaction.projections.retry(skipped);
    return retried.ok ? ok({ ...touched.value, skipped }) : retried;
  }

  // A card whose read fails is unreadable and keeps its touch; only a
  // failure of the projection state fails the batch.
  async #projectCard(
    transaction: ProjectionTransaction, reader: CardReader, runId: WorkflowRunId, at: Instant,
  ): Promise<Result<'projected' | 'unreadable'>> {
    const record = await transaction.cards.get(runId);
    if (!record.ok) return ok('unreadable');
    if (record.value === undefined) return ok('projected');
    const view = await reader.view(record.value);
    if (!view.ok) return ok('unreadable');
    const projection = projectionKey(view.value);
    const last = await transaction.projections.lastCard(runId);
    if (!last.ok) return last;
    if (last.value === projection) return ok('projected');
    const appended = await append(transaction.outbox, record.value.projectId, { type: 'card-changed', card: view.value.card }, at);
    if (!appended.ok) return appended;
    const recorded = await transaction.projections.recordCard(runId, projection);
    return recorded.ok ? ok('projected') : recorded;
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

import { AUTO_MERGE_STARTS_ON } from '@taskelith/access';
import type { NeedsYouSource, SessionTimelineTransaction, ViewPositions } from '@taskelith/execution';
import { NoMergeQueue } from '@taskelith/integrations';
import { ok } from '@taskelith/kernel';
import type { PostgresDatabase, PostgresTransaction } from '@taskelith/postgres';
import type { BoardReads, BoardStore } from '../application/board-reads.js';
import { BoardViews } from '../application/board-views.js';
import { CardProjector, type ProjectionStore, type ProjectionTransaction } from '../application/card-projector.js';
import type { CardViewParts } from '../application/card-views.js';

export interface BoardServices {
  readonly views: BoardViews;
  readonly projector: CardProjector;
}

// The inbox sources over one snapshot's timeline and its log head.
export type InboxSourcesIn = (transaction: SessionTimelineTransaction, positions: ViewPositions) => readonly NeedsYouSource[];

// The views read one REPEATABLE READ snapshot each; the projector runs
// SERIALIZABLE. The merge queue is empty until item 23.
export function startBoardServices(database: PostgresDatabase, sourcesIn: InboxSourcesIn): BoardServices {
  const parts: CardViewParts = {
    mergeQueue: new NoMergeQueue(),
    sources: (reads) => sourcesIn(reads.timeline, {
      current: async () => {
        const head = await reads.head();
        return head.ok ? ok(String(head.value)) : head;
      },
    }),
  };
  const views: BoardStore = { snapshot: (work) => database.readOnly((transaction) => work(boardReadsOf(transaction))) };
  const projections: ProjectionStore = { transaction: (work) => database.transaction((transaction) => work(projectionOf(transaction))) };
  return { views: new BoardViews({ ...parts, store: views }), projector: new CardProjector(projections, parts) };
}

export function boardReadsOf(transaction: PostgresTransaction): BoardReads {
  return {
    head: async () => {
      const bounds = await transaction.uiEvents.bounds();
      return bounds.ok ? ok(bounds.value.head) : bounds;
    },
    now: () => transaction.now(),
    cards: transaction.cards,
    runs: transaction.runs,
    gates: transaction.gates,
    tasks: transaction.tasks,
    admissions: transaction.admissions,
    timeline: transaction.sessionTimeline,
    placementOutcomes: transaction.placementOutcomes,
    assignments: transaction.assignments,
    fleet: {
      workers: async () => {
        const ids = await transaction.fleet.activeWorkerIds();
        if (!ids.ok) return ids;
        const records = await Promise.all(ids.value.map((workerId) => transaction.workers.get(workerId)));
        return ok(Object.freeze(records.flatMap((record) => (record === undefined ? [] : [record]))));
      },
      quarantined: async () => (await transaction.installation.quarantined()) || (await transaction.installation.recoveryEpoch()) === undefined,
      occupancy: (workerId) => transaction.ledger.heldOnWorker(workerId),
      heldForAttempt: (attemptId) => transaction.ledger.heldForAttempt(attemptId),
    },
    autoMergeEnabled: async (projectId) => {
      const setting = await transaction.access.projects.autoMergeSetting(projectId);
      return setting.ok ? ok(setting.value?.enabled ?? AUTO_MERGE_STARTS_ON) : setting;
    },
  };
}

function projectionOf(transaction: PostgresTransaction): ProjectionTransaction {
  return { ...boardReadsOf(transaction), projections: transaction.cardProjections, outbox: transaction.uiEvents };
}


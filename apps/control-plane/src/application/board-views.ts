import type {
  Board,
  BoardReadModel,
  NeedsYouCounts,
  NeedsYouFilter,
  NeedsYouInbox,
  NeedsYouList,
  NeedsYouScope,
  TaskDetail,
  ViewStamp,
} from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { WorkflowRunId } from '@taskelith/sdlc';
import type { BoardReads, BoardStore } from './board-reads.js';
import { CardReader, type CardViewParts } from './card-views.js';

export interface BoardViewDependencies extends CardViewParts {
  readonly store: BoardStore;
}

// The board, task detail, and inbox views (wire contracts section 8): each
// is one snapshot whose position, the log's head, is read first.
export class BoardViews implements NeedsYouInbox {
  readonly #dependencies: BoardViewDependencies;

  constructor(dependencies: BoardViewDependencies) {
    this.#dependencies = dependencies;
  }

  // `callerMayAct` is Access's answer, which the port only carries.
  forCaller(callerMayAct: boolean): BoardReadModel {
    return {
      board: (projectId) => this.#snapshot(async (reader, stamp) => {
        const records = await reader.reads.cards.listByProject(projectId);
        if (!records.ok) return records;
        const cards = [];
        for (const record of records.value) {
          const card = await reader.cards.card(record);
          if (!card.ok) return card;
          cards.push(card.value);
        }
        const workersOnline = await reader.cards.workersOnline();
        if (!workersOnline.ok) return workersOnline;
        return ok<Board>(Object.freeze({ ...stamp, projectId, cards: Object.freeze(cards), workersOnline: workersOnline.value, callerMayAct }));
      }),
      taskDetail: (projectId, runId) => this.#snapshot(async (reader, stamp) => {
        const record = await reader.reads.cards.get(runId);
        if (!record.ok) return record;
        if (record.value?.projectId !== projectId) return unknownCard(runId);
        const view = await reader.cards.view(record.value);
        if (!view.ok) return view;
        const { card, stages, runBinding, tasks } = view.value;
        return ok<TaskDetail>(Object.freeze({ ...stamp, card, stages, traceability: Object.freeze([]), runBinding, tasks }));
      }),
    };
  }

  open(scope: NeedsYouScope, filter: NeedsYouFilter = {}): Promise<Result<NeedsYouList>> {
    return this.#snapshot(async (reader, stamp) => {
      const items = await reader.cards.openItems(scope);
      if (!items.ok) return items;
      const kept = items.value.filter((item) => (filter.kind === undefined || item.kind === filter.kind)
        && (filter.runId === undefined || (item.subject.scope === 'card' && item.subject.runId === filter.runId)));
      return ok<NeedsYouList>(Object.freeze({ ...stamp, items: Object.freeze(kept) }));
    });
  }

  // Counted per card only for registered cards of a project scope.
  counts(scope: NeedsYouScope): Promise<Result<NeedsYouCounts>> {
    return this.#snapshot(async (reader, stamp) => {
      const items = await reader.cards.openItems(scope);
      if (!items.ok) return items;
      const byRun = new Map<WorkflowRunId, number>();
      if (scope.kind === 'project') {
        const cards = await reader.reads.cards.listByProject(scope.projectId);
        if (!cards.ok) return cards;
        const known = new Set(cards.value.map((card) => card.runId));
        for (const item of items.value) {
          if (item.subject.scope === 'card' && known.has(item.subject.runId)) byRun.set(item.subject.runId, (byRun.get(item.subject.runId) ?? 0) + 1);
        }
      }
      const byCard = [...byRun].sort(([left], [right]) => (left < right ? -1 : 1)).map(([runId, count]) => Object.freeze({ runId, count }));
      return ok<NeedsYouCounts>(Object.freeze({ ...stamp, total: items.value.length, byCard: Object.freeze(byCard) }));
    });
  }

  // A source that cannot be read fails the view, never a partial one.
  async #snapshot<Value>(work: (reader: SnapshotReader, stamp: ViewStamp) => Promise<Result<Value>>): Promise<Result<Value>> {
    return this.#dependencies.store.snapshot(async (reads) => {
      const head = await reads.head();
      if (!head.ok) return head;
      const asOf = await reads.now();
      const reader = { reads, cards: new CardReader(reads, this.#dependencies, asOf) };
      return work(reader, Object.freeze({ asOf, position: String(head.value) }));
    });
  }
}

interface SnapshotReader {
  readonly reads: BoardReads;
  readonly cards: CardReader;
}

function unknownCard(runId: WorkflowRunId): Result<never> {
  return err(failure('not-found', `run ${runId} is not a card of the project`));
}


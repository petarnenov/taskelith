import { createHash } from 'node:crypto';
import {
  ALREADY_ANSWERED,
  ITEM_CLOSED,
  isUnknownExecution,
  type AnswerRequest,
  type AttemptId,
  type CardRecord,
  type NeedsYouAnswer,
  type NeedsYouItem,
  type NeedsYouItemId,
  type NeedsYouResolution,
  type NeedsYouScope,
  type NeedsYouSource,
  type NeedsYouSourceId,
  type SessionTextRedactor,
  type SourcePage,
  type Execution,
  type Task,
  type UnrecordedProcess,
  type ViewPositions,
} from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { parseEvidenceReference } from '@taskelith/sdlc';
import type { BoardReads } from './board-reads.js';

export const RECONCILIATION_SOURCE_ID = 'reconciliation' as NeedsYouSourceId;
export const RECONCILIATION_PAGE_SIZE = 100;

const TITLES = Object.freeze({
  'unknown-execution': 'An execution of a task has an unknown outcome',
  'unrecorded-process': 'A worker reported a process that no journal records',
});

const DECISIONS = Object.freeze({ 'unknown-execution': 'resolve-execution', 'unrecorded-process': 'acknowledge-process' });

export type ReconciliationReads = Pick<BoardReads, 'cards' | 'tasks' | 'reconciliation'>;

export type OpenReconciliation = Extract<NeedsYouItem, { readonly kind: 'reconciliation'; readonly state: 'open' }>;

export type ReconciliationResolution = Omit<NeedsYouResolution, 'resolvedAt'>;

// Applies an answer and records its resolved item, in the answer's
// transaction; a view's snapshot has `ANSWERED_ELSEWHERE`.
export interface ReconciliationResolver {
  resolve(item: OpenReconciliation, resolution: ReconciliationResolution): Promise<Result<NeedsYouItem>>;
}

export const ANSWERED_ELSEWHERE: ReconciliationResolver = Object.freeze({
  resolve: async () => err(failure('internal', 'a view snapshot answers no inbox item')),
});

export interface ReconciliationSourceParts {
  readonly reads: ReconciliationReads;
  readonly positions: ViewPositions;
  readonly redactor: SessionTextRedactor;
  readonly resolver: ReconciliationResolver;
}

// The source over the G2 reconciliation queue (product ports section 4.1):
// an unknown execution of a card's task, or a worker's unrecorded process.
export class ReconciliationSource implements NeedsYouSource {
  readonly id = RECONCILIATION_SOURCE_ID;
  readonly kinds = Object.freeze(['reconciliation'] as const);
  readonly #parts: ReconciliationSourceParts;

  constructor(parts: ReconciliationSourceParts) {
    this.#parts = parts;
  }

  // Pages in item identifier order, which `after` continues.
  async openItems(scope: NeedsYouScope, after?: string): Promise<Result<SourcePage>> {
    const position = await this.#parts.positions.current();
    if (!position.ok) return position;
    const items = await this.#openItems(scope);
    if (!items.ok) return items;
    const page = items.value.filter((item) => after === undefined || item.id > after).slice(0, RECONCILIATION_PAGE_SIZE);
    return ok(Object.freeze({ items: Object.freeze(page), position: position.value }));
  }

  // A resolved item stays readable; an open or closed one is read from the
  // queue and the cards' tasks.
  async item(scope: NeedsYouScope, itemId: NeedsYouItemId): Promise<Result<NeedsYouItem | undefined>> {
    const answered = await this.#parts.reads.reconciliation.answers.get(itemId);
    if (!answered.ok) return answered;
    if (answered.value !== undefined) return ok(isInScope(answered.value, scope) ? answered.value : undefined);
    const items = scope.kind === 'project' ? await this.#executionItems(scope.projectId) : await this.#processItems();
    return items.ok ? ok(items.value.find((item) => item.id === itemId)) : items;
  }

  async answer(request: AnswerRequest): Promise<Result<NeedsYouItem>> {
    const item = await this.item(request.scope, request.itemId);
    if (!item.ok) return item;
    if (item.value === undefined) return err(failure('not-found', `no inbox item ${request.itemId}`));
    if (item.value.kind !== 'reconciliation') return err(failure('internal', `item ${request.itemId} is not a reconciliation item`));
    if (item.value.state === 'closed') return err(failure('precondition-failed', `item ${request.itemId} is closed`, { reason: ITEM_CLOSED }));
    if (item.value.state !== 'open') return err(failure('conflict', `item ${request.itemId} is resolved`, { reason: ALREADY_ANSWERED }));
    const answer = this.#recordedAnswer(item.value, request.answer);
    if (!answer.ok) return answer;
    return this.#parts.resolver.resolve(item.value, { resolvedBy: request.responder, answer: answer.value });
  }

  // The answer as recorded: its texts redacted, as session text is.
  #recordedAnswer(item: OpenReconciliation, answer: NeedsYouAnswer): Result<NeedsYouAnswer> {
    if (answer.kind !== 'reconciliation' || answer.decision !== DECISIONS[item.reconciliationReason]) {
      return err(failure('invalid', `item ${item.id} takes the answer ${DECISIONS[item.reconciliationReason]}`));
    }
    const evidence = parseEvidenceReference(this.#parts.redactor.redact(answer.evidence));
    if (!evidence.ok) return evidence;
    return ok(Object.freeze({ ...answer, evidence: evidence.value, reason: this.#parts.redactor.redact(answer.reason) }));
  }

  async #openItems(scope: NeedsYouScope): Promise<Result<readonly NeedsYouItem[]>> {
    const items = scope.kind === 'project' ? await this.#executionItems(scope.projectId) : await this.#processItems();
    if (!items.ok) return items;
    return ok(items.value.filter((item) => item.state === 'open').sort((left, right) => (left.id < right.id ? -1 : 1)));
  }

  // An item per execution of the project's cards' tasks that was ever
  // uncertain: open while unknown, closed once a terminal fact arrived.
  async #executionItems(projectId: CardRecord['projectId']): Promise<Result<readonly NeedsYouItem[]>> {
    const { cards, tasks } = this.#parts.reads;
    const records = await cards.listByProject(projectId);
    if (!records.ok) return records;
    const items: NeedsYouItem[] = [];
    for (const card of records.value) {
      const links = await cards.tasks(card.runId);
      if (!links.ok) return links;
      for (const link of links.value) {
        const task = await tasks.get(link.taskId);
        if (!task.ok) return task;
        items.push(...task.value.attempts.flatMap((attempt) => attempt.executions.flatMap((execution) => {
          const item = executionItem(card, task.value, attempt.id, execution);
          return item === undefined ? [] : [item];
        })));
      }
    }
    return ok(items);
  }

  // Every unrecorded process that no answer acknowledged yet.
  async #processItems(): Promise<Result<readonly NeedsYouItem[]>> {
    const { reconciliation } = this.#parts.reads;
    const items: NeedsYouItem[] = [];
    for (const process of await reconciliation.unrecordedProcesses()) {
      const item = processItem(process);
      const answered = await reconciliation.answers.get(item.id);
      if (!answered.ok) return answered;
      if (answered.value === undefined) items.push(item);
    }
    return ok(items);
  }
}

function executionItem(card: CardRecord, task: Task, attemptId: AttemptId, execution: Execution): NeedsYouItem | undefined {
  const [uncertain] = execution.evidence.filter(({ kind }) => kind !== 'cancellation-not-applied');
  if (uncertain === undefined) return undefined;
  const subject = {
    scope: 'card' as const, projectId: card.projectId, runId: card.runId, taskId: task.id, attemptId,
    attemptGeneration: task.ownershipGeneration, executionId: execution.id,
  };
  const fields = {
    id: itemIdOf(['unknown-execution', execution.id]), sourceId: RECONCILIATION_SOURCE_ID, kind: 'reconciliation' as const,
    reconciliationReason: 'unknown-execution' as const, observed: execution.evidence, subject: Object.freeze(subject),
    title: TITLES['unknown-execution'], createdAt: uncertain.observedAt, answerableBy: 'project-maintainer' as const,
  };
  if (isUnknownExecution(execution)) return Object.freeze({ ...fields, state: 'open' as const });
  return Object.freeze({ ...fields, state: 'closed' as const, closedAt: execution.exit?.recordedAt ?? task.changedAt });
}

function processItem({ workerId, journalId, observationId, containment, processCount, recordedAt }: UnrecordedProcess): NeedsYouItem {
  return Object.freeze({
    id: itemIdOf(['unrecorded-process', workerId, journalId, observationId]), sourceId: RECONCILIATION_SOURCE_ID,
    kind: 'reconciliation', reconciliationReason: 'unrecorded-process', containment, processCount,
    subject: Object.freeze({ scope: 'installation' as const, workerId, journalId, observationId }),
    title: TITLES['unrecorded-process'], createdAt: recordedAt, answerableBy: 'installation-owner', state: 'open',
  });
}

// `r` and 32 hexadecimal digits of the subject's digest: the same subject
// is the same item in every read.
function itemIdOf(subject: readonly string[]): NeedsYouItemId {
  return `r${createHash('sha256').update(JSON.stringify(subject)).digest('hex').slice(0, 32)}` as NeedsYouItemId;
}

function isInScope({ subject }: NeedsYouItem, scope: NeedsYouScope): boolean {
  if (subject.scope === 'installation') return scope.kind === 'installation';
  return scope.kind === 'project' && subject.projectId === scope.projectId;
}

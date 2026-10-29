import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import type { Clock } from '@taskelith/sdlc';
import type { Answer } from '../domain/session-records.js';
import type {
  AnswerRequest,
  NeedsYouAnswer,
  NeedsYouItem,
  NeedsYouItemId,
  NeedsYouScope,
  NeedsYouSource,
  NeedsYouSourceId,
  SourcePage,
} from '../ports/needs-you.js';
import type { InputDigest } from '../ports/session-input.js';
import { SESSION_ITEM_KINDS, type ScopedInboxItem, type SessionItemKind } from '../ports/session-inbox-items.js';
import type { ViewPositions } from '../ports/session-scopes.js';
import type { SessionTimelineStore, SessionTimelineTransaction } from '../ports/session-timeline-store.js';
import { ALREADY_ANSWERED, KEY_REUSED, type SessionTimelineService } from './session-timeline-service.js';

export const SOURCE_PAGE_SIZE = 100;
export const ITEM_CLOSED = 'item-closed';

// Fixed titles: no session text, which only members may read, reaches one.
const TITLES: Readonly<Record<SessionItemKind, string>> = Object.freeze({
  'permission-request': 'An agent session asks for a permission',
  'input-request': 'An agent session asks for input',
  'delivery-acknowledgement': 'A response may not have reached its agent session',
});

export interface NativeRequestSourceDependencies {
  readonly id: NeedsYouSourceId;
  readonly store: SessionTimelineStore;
  readonly timeline: SessionTimelineService;
  readonly digest: InputDigest;
  readonly clock: Clock;
  readonly positions: ViewPositions;
}

interface AnsweredItem {
  readonly scoped: ScopedInboxItem;
  readonly request: AnswerRequest;
}

// The inbox source of native requests (wire contracts 8 and 8.1); an
// answer reaches its request through the timeline's own consumption.
export class NativeRequestSource implements NeedsYouSource {
  readonly id: NeedsYouSourceId;
  readonly kinds = SESSION_ITEM_KINDS;
  readonly #store: SessionTimelineStore;
  readonly #timeline: SessionTimelineService;
  readonly #digest: InputDigest;
  readonly #clock: Clock;
  readonly #positions: ViewPositions;

  constructor(dependencies: NativeRequestSourceDependencies) {
    this.id = dependencies.id;
    this.#store = dependencies.store;
    this.#timeline = dependencies.timeline;
    this.#digest = dependencies.digest;
    this.#clock = dependencies.clock;
    this.#positions = dependencies.positions;
  }

  // The installation scope has none of these kinds.
  async openItems(scope: NeedsYouScope, after?: string): Promise<Result<SourcePage>> {
    const position = await this.#positions.current();
    if (!position.ok) return position;
    if (scope.kind === 'installation') return ok(Object.freeze({ items: Object.freeze([]), position: position.value }));
    const from = after === undefined ? ok(undefined) : parseIdentifier('NeedsYouItemId', after);
    if (!from.ok) return from;
    const listed = await this.#store.transaction((tx) => tx.items.listOpen(scope.projectId, from.value, SOURCE_PAGE_SIZE));
    if (!listed.ok) return listed;
    const items = listed.value.flatMap((scoped) => this.#itemOf(scoped) ?? []);
    return ok(Object.freeze({ items: Object.freeze(items), position: position.value }));
  }

  async answer(request: AnswerRequest): Promise<Result<NeedsYouItem>> {
    const scoped = await this.#store.transaction((tx) => tx.items.get(request.itemId));
    if (!scoped.ok) return scoped;
    if (scoped.value?.scope === undefined) return unknownItem(request.itemId);
    if (scoped.value.item.kind !== request.answer.kind) return err(failure('invalid', `item ${request.itemId} takes another kind of answer`));
    const answered = { scoped: scoped.value, request };
    return scoped.value.item.kind === 'delivery-acknowledgement' ? this.#acknowledge(answered) : this.#consume(answered);
  }

  // The same consumption as `respondToNativeRequest`, so the first of the
  // two to commit wins and the other is `already-answered`.
  async #consume({ scoped, request }: AnsweredItem): Promise<Result<NeedsYouItem>> {
    const { item } = scoped;
    const answer = timelineAnswerOf(request.answer);
    if (answer === undefined || item.attemptId === undefined || item.attemptGeneration === undefined) {
      return err(failure('invalid', `item ${item.id} takes no such answer`));
    }
    const consumed = await this.#timeline.consumeResponse(item.sessionId, {
      key: request.idempotencyKey,
      response: {
        request: item.request, answer, responder: { kind: 'principal', principalId: request.responder },
        attemptId: item.attemptId, ownershipGeneration: item.attemptGeneration,
      },
    });
    if (!consumed.ok) return consumed.error.code === 'not-found' ? itemClosed(item.id) : consumed;
    return this.#current(item.id);
  }

  // Resolves the item, audited; it resends, answers, and starts nothing.
  #acknowledge({ scoped, request }: AnsweredItem): Promise<Result<NeedsYouItem>> {
    const { item } = scoped;
    const scope = `item:${item.id}`;
    const digest = this.#digest.digest(JSON.stringify(['acknowledge', request.responder]));
    return this.#store.transaction(async (tx) => {
      const current = await tx.items.get(item.id);
      if (!current.ok) return current;
      if (current.value === undefined) return unknownItem(item.id);
      const held = await tx.idempotency.find(item.sessionId, scope, request.idempotencyKey);
      if (!held.ok) return held;
      if (held.value !== undefined) return held.value.digest === digest ? this.#found(current.value) : keyReused(item.id);
      if (current.value.item.state === 'resolved') return err(failure('conflict', `item ${item.id} is resolved`, { reason: ALREADY_ANSWERED }));
      if (current.value.item.state === 'closed') return itemClosed(item.id);
      const resolved = await this.#resolve(tx, current.value, request);
      if (!resolved.ok) return resolved;
      const recorded = await tx.idempotency.record(item.sessionId, { scope, key: request.idempotencyKey, digest });
      return recorded.ok ? this.#found(resolved.value) : recorded;
    });
  }

  async #resolve(tx: SessionTimelineTransaction, scoped: ScopedInboxItem, request: AnswerRequest): Promise<Result<ScopedInboxItem>> {
    const at = this.#clock.now();
    const { state: _state, ...fields } = scoped.item;
    const item = { ...fields, state: 'resolved' as const, resolution: { resolvedBy: request.responder, resolvedAt: at, answer: request.answer } };
    const settled = await tx.items.settle(item);
    if (!settled.ok) return settled;
    const audited = await tx.audit.append({ kind: 'session.delivery-acknowledged', subject: item.id, actor: request.responder, occurredAt: at });
    return audited.ok ? ok({ ...scoped, item }) : audited;
  }

  async #current(itemId: NeedsYouItemId): Promise<Result<NeedsYouItem>> {
    const scoped = await this.#store.transaction((tx) => tx.items.get(itemId));
    if (!scoped.ok) return scoped;
    return scoped.value === undefined ? unknownItem(itemId) : this.#found(scoped.value);
  }

  #found(scoped: ScopedInboxItem): Result<NeedsYouItem> {
    const item = this.#itemOf(scoped);
    return item === undefined ? unknownItem(scoped.item.id) : ok(item);
  }

  #itemOf({ item, scope }: ScopedInboxItem): NeedsYouItem | undefined {
    if (scope === undefined) return undefined;
    const { id, kind, sessionId, taskId, request, attemptId, attemptGeneration, createdAt } = item;
    const subject = {
      scope: 'card' as const, projectId: scope.projectId, runId: scope.runId, taskId,
      ...(attemptId === undefined ? {} : { attemptId }), ...(attemptGeneration === undefined ? {} : { attemptGeneration }),
      sessionId, sessionGeneration: request.generation, nativeRequestId: request.nativeRequestId,
    };
    const fields = { id, sourceId: this.id, kind, subject, title: TITLES[kind], createdAt, answerableBy: 'project-operator' as const };
    switch (item.state) {
      case 'open':
        return Object.freeze({ ...fields, state: item.state });
      case 'resolved':
        return Object.freeze({ ...fields, state: item.state, resolution: item.resolution });
      case 'closed':
        return Object.freeze({ ...fields, state: item.state, closedAt: item.closedAt });
    }
  }
}

function timelineAnswerOf(answer: NeedsYouAnswer): Answer | undefined {
  if (answer.kind === 'permission-request') return { kind: 'permission', decision: answer.decision };
  if (answer.kind === 'input-request') return { kind: 'input', text: answer.text };
  return undefined;
}

function unknownItem(itemId: NeedsYouItemId): Result<never> {
  return err(failure('not-found', `no inbox item ${itemId}`));
}

function itemClosed(itemId: NeedsYouItemId): Result<never> {
  return err(failure('precondition-failed', `item ${itemId} is closed`, { reason: ITEM_CLOSED }));
}

function keyReused(itemId: NeedsYouItemId): Result<never> {
  return err(failure('conflict', `item ${itemId} holds the key with another answer`, { reason: KEY_REUSED }));
}

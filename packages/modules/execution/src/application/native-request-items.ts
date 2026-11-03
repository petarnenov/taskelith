import { ok, type Instant, type Result } from '@taskelith/kernel';
import type { NeedsYouItem, NeedsYouSourceId } from '../ports/needs-you.js';
import type { ScopedInboxItem, SessionItemKind } from '../ports/session-inbox-items.js';
import { INSTALLATION_SCOPE, projectScope, type UiEventOutbox, type UiEventScope } from '../ports/ui-events.js';

// The source of the session timeline's inbox items (wire contracts 8.1).
export const NATIVE_REQUEST_SOURCE_ID = 'native-requests' as NeedsYouSourceId;

// Fixed titles: no session text, which only members may read, reaches one.
const TITLES: Readonly<Record<SessionItemKind, string>> = Object.freeze({
  'permission-request': 'An agent session asks for a permission',
  'input-request': 'An agent session asks for input',
  'delivery-acknowledgement': 'A response may not have reached its agent session',
});

// The inbox item of a session's item; none for a session without a scope.
export function nativeRequestItem(sourceId: NeedsYouSourceId, { item, scope }: ScopedInboxItem): NeedsYouItem | undefined {
  if (scope === undefined) return undefined;
  const { id, kind, sessionId, taskId, request, attemptId, attemptGeneration, createdAt } = item;
  const subject = {
    scope: 'card' as const, projectId: scope.projectId, runId: scope.runId, taskId,
    ...(attemptId === undefined ? {} : { attemptId }), ...(attemptGeneration === undefined ? {} : { attemptGeneration }),
    sessionId, sessionGeneration: request.generation, nativeRequestId: request.nativeRequestId,
  };
  const fields = { id, sourceId, kind, subject, title: TITLES[kind], createdAt, answerableBy: 'project-operator' as const };
  switch (item.state) {
    case 'open':
      return Object.freeze({ ...fields, state: item.state });
    case 'resolved':
      return Object.freeze({ ...fields, state: item.state, resolution: item.resolution });
    case 'closed':
      return Object.freeze({ ...fields, state: item.state, closedAt: item.closedAt });
  }
}

// Sends the item's `inbox-item-changed` in the transaction that changed it;
// an item without a scope reaches no stream.
export function publishItem(events: UiEventOutbox, item: NeedsYouItem | undefined, occurredAt: Instant): Promise<Result<void>> {
  if (item === undefined) return Promise.resolve(ok(undefined));
  return events.append(Object.freeze({ scope: itemScope(item), occurredAt, record: Object.freeze({ type: 'inbox-item-changed' as const, item }) }));
}

function itemScope(item: NeedsYouItem): UiEventScope {
  return item.subject.scope === 'card' ? projectScope(item.subject.projectId) : INSTALLATION_SCOPE;
}

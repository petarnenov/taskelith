import type { HttpSchemas } from '@taskelith/contracts';
import type { NeedsYouItem, UiEvent } from '@taskelith/execution';
import type { StreamFrame } from '../application/event-stream-hub.js';
import { agentSessionBody, nativeRequestBody, outputEntryBody, turnBody } from './agent-session-wire.js';

type Wire<Name extends keyof HttpSchemas> = HttpSchemas[Name];

// The `data` of an event frame of a project or the installation stream.
export type EventData = Exclude<Wire<'ProjectEvent'>, { type: 'resync' | 'stream-ended' }>;

// Wire contracts section 10: an event's data is the record that its read
// returns for the same state, with its type, position, and time.
export function eventData(position: number, event: UiEvent): EventData {
  const header = { position: String(position), occurredAt: event.occurredAt };
  const { record } = event;
  switch (record.type) {
    case 'board-changed': {
      const projectId = event.scope.kind === 'project' ? event.scope.projectId : '';
      return { type: record.type, ...header, projectId, workersOnline: record.workersOnline };
    }
    case 'card-changed':
      return { type: record.type, ...header, card: record.card };
    case 'inbox-item-changed':
      return { type: record.type, ...header, item: inboxItemBody(record.item) };
    case 'agent-session-changed':
      return { type: record.type, ...header, session: agentSessionBody(record.session, record.card) };
    case 'turn-changed':
      return { type: record.type, ...header, sessionId: record.sessionId, turn: turnBody(record.turn) };
    case 'native-request-changed':
      return { type: record.type, ...header, sessionId: record.sessionId, request: nativeRequestBody(record.request, record.position) };
    case 'output-appended':
      return { type: record.type, ...header, sessionId: record.sessionId, entry: outputEntryBody(record.entry) };
  }
}

// The item's state becomes its `status`; its other fields keep their names.
export function inboxItemBody(item: NeedsYouItem): Wire<'InboxItem'> {
  const { id, sourceId, kind, subject, title, createdAt, answerableBy } = item;
  const fields = { itemId: id, sourceId, kind, subject, title, createdAt, answerableBy, status: statusBody(item) };
  return { ...fields, ...reasonFields(item) } as Wire<'InboxItem'>;
}

// The fields that only an escalation or a reconciliation item carries.
function reasonFields(item: NeedsYouItem): object {
  if (item.kind === 'escalation') return { escalationReason: item.escalationReason };
  if (item.kind !== 'reconciliation') return {};
  const { reconciliationReason } = item;
  if (item.reconciliationReason === 'unknown-execution') return { reconciliationReason, observed: item.observed };
  return { reconciliationReason, containment: item.containment, processCount: item.processCount };
}

function statusBody(item: NeedsYouItem): Wire<'InboxItemStatus'> {
  switch (item.state) {
    case 'open':
      return { state: 'open' };
    case 'resolved': {
      const { resolvedBy, resolvedAt, answer } = item.resolution;
      return { state: 'resolved', resolvedBy, resolvedAt, answer } as Wire<'InboxItemStatus'>;
    }
    case 'closed':
      return { state: 'closed', closedAt: item.closedAt };
  }
}

// One frame of `text/event-stream`: an event's `id`, `event`, and one
// `data` line; a resync or an end has no `id`, and a keep-alive is a comment.
export function frameText(frame: Exclude<StreamFrame, { kind: 'event' }> | { kind: 'event'; data: EventData }): string {
  switch (frame.kind) {
    case 'event':
      return `id: ${frame.data.position}\nevent: ${frame.data.type}\ndata: ${JSON.stringify(frame.data)}\n\n`;
    case 'resync':
    case 'stream-ended':
      return `event: ${frame.kind}\ndata: ${JSON.stringify({ type: frame.kind, reason: frame.reason })}\n\n`;
    case 'keep-alive':
      return ': keep-alive\n\n';
  }
}

import type { Inbox, InboxOutcome } from '@taskelith/execution';
import { ok, parseIdentifier, type EventId, type Result } from '@taskelith/kernel';
import type { WireMessage } from './wire-message.js';

// Applies a message at most once per consumer, by the identity in its body,
// for the inbox's lifetime rather than the broker's window. Pass the inbox of
// the transaction that applies the message, so both commit together.
export async function applyOnce(
  inbox: Inbox,
  consumer: string,
  message: WireMessage,
  apply: () => Promise<Result<void>>,
): Promise<Result<InboxOutcome>> {
  if (message.identity === undefined) return outcome(await apply(), 'accepted');
  const messageId = parseIdentifier('EventId', message.identity);
  if (!messageId.ok) return messageId;
  const accepted = await inbox.accept(consumer, messageId.value as EventId);
  if (!accepted.ok || accepted.value === 'duplicate') return accepted;
  return outcome(await apply(), 'accepted');
}

function outcome(applied: Result<void>, value: InboxOutcome): Result<InboxOutcome> {
  return applied.ok ? ok(value) : applied;
}

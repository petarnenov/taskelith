import type { AuditEvent } from '@taskelith/access';
import type { Session } from './session.js';

// The one writer of `audit_events`, in the caller's transaction; a trigger
// keeps every row immutable.
export async function appendAuditEvent(session: Session, event: AuditEvent): Promise<void> {
  await session.query(
    'INSERT INTO audit_events (kind, subject, generation, actor, reason, occurred_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [event.kind, event.subject, event.generation, event.actor, event.reason, event.occurredAt],
  );
}

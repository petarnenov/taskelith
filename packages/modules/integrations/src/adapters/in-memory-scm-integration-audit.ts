import { ok, type Result } from '@taskelith/kernel';
import type { ScmIntegrationAudit, ScmIntegrationAuditEvent } from '../ports/scm-integration-audit.js';

// Shows a staged row to readers when called, as a commit would.
export type PublishAuditRow = () => void;

// The trail in memory, for tests and tools.
export class InMemoryScmIntegrationAudit implements ScmIntegrationAudit {
  readonly #events: ScmIntegrationAuditEvent[] = [];

  async append(event: ScmIntegrationAuditEvent): Promise<Result<void>> {
    const staged = await this.stage(event);
    if (!staged.ok) return staged;
    staged.value();
    return ok(undefined);
  }

  // Accepts the row without showing it, so a store can publish it in the
  // same step as its own change.
  async stage(event: ScmIntegrationAuditEvent): Promise<Result<PublishAuditRow>> {
    const row = Object.freeze({ ...event, changedFields: Object.freeze([...event.changedFields]) });
    return ok(() => { this.#events.push(row); });
  }

  async trail(): Promise<Result<readonly ScmIntegrationAuditEvent[]>> {
    return ok(Object.freeze([...this.#events]));
  }
}

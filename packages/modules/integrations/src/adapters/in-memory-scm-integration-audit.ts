import { ok, type Result } from '@taskelith/kernel';
import type { ScmIntegrationAudit, ScmIntegrationAuditEvent } from '../ports/scm-integration-audit.js';

// The trail in memory, for tests and tools.
export class InMemoryScmIntegrationAudit implements ScmIntegrationAudit {
  readonly #events: ScmIntegrationAuditEvent[] = [];

  async append(event: ScmIntegrationAuditEvent): Promise<Result<void>> {
    this.#events.push(Object.freeze({ ...event, changedFields: Object.freeze([...event.changedFields]) }));
    return ok(undefined);
  }

  async trail(): Promise<Result<readonly ScmIntegrationAuditEvent[]>> {
    return ok(Object.freeze([...this.#events]));
  }
}

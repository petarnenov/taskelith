import { ok, type Result } from '@taskelith/kernel';
import type { ScmIntegrationAudit, ScmIntegrationAuditEvent, ScmIntegrationAuditKind, ScmIntegrationId } from '@taskelith/integrations';
import { instant } from './capacity-repositories.js';
import type { PostgresDatabase } from './postgres-database.js';
import type { Session } from './session.js';

interface AuditRow {
  readonly integration_id: string;
  readonly kind: ScmIntegrationAuditKind;
  readonly actor: string;
  readonly reason: string;
  readonly changed_fields: string[];
  readonly revision: number;
  readonly occurred_at: Date;
}

// The rows inside one transaction, which the store's writes share.
export class PostgresScmIntegrationAuditRecords implements ScmIntegrationAudit {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async append(event: ScmIntegrationAuditEvent): Promise<Result<void>> {
    const { integrationId, kind, actor, reason, changedFields, revision, occurredAt } = event;
    await this.#session.query(`INSERT INTO scm_integration_audit_events
      (integration_id, kind, actor, reason, changed_fields, revision, occurred_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [integrationId, kind, actor, reason, [...changedFields], revision, occurredAt]);
    return ok(undefined);
  }

  async trail(): Promise<Result<readonly ScmIntegrationAuditEvent[]>> {
    const { rows } = await this.#session.query<AuditRow>(`SELECT integration_id, kind, actor, reason, changed_fields, revision, occurred_at
      FROM scm_integration_audit_events ORDER BY position`);
    return ok(Object.freeze(rows.map(eventOf)));
  }
}

// Each append commits alone, and the trail reads in a read-only one.
export class PostgresScmIntegrationAudit implements ScmIntegrationAudit {
  readonly #database: Pick<PostgresDatabase, 'transaction' | 'readOnly'>;

  constructor(database: Pick<PostgresDatabase, 'transaction' | 'readOnly'>) {
    this.#database = database;
  }

  append(event: ScmIntegrationAuditEvent): Promise<Result<void>> {
    return this.#database.transaction(({ scmIntegrationAudit }) => scmIntegrationAudit.append(event));
  }

  trail(): Promise<Result<readonly ScmIntegrationAuditEvent[]>> {
    return this.#database.readOnly(({ scmIntegrationAudit }) => scmIntegrationAudit.trail());
  }
}

function eventOf(row: AuditRow): ScmIntegrationAuditEvent {
  return Object.freeze({
    integrationId: row.integration_id as ScmIntegrationId, kind: row.kind, actor: row.actor, reason: row.reason,
    changedFields: Object.freeze([...row.changed_fields]), revision: row.revision, occurredAt: instant(row.occurred_at),
  });
}

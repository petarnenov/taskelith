import { err, failure, ok, type Result } from '@taskelith/kernel';
import { codeUnitOrder, type ScmIntegration, type ScmIntegrationId, type ScmSecrets } from '../domain/scm-integration.js';
import { changeAudit, creationAudit, type ScmIntegrationAudit, type ScmIntegrationAuditEntry, type ScmIntegrationAuditEvent } from '../ports/scm-integration-audit.js';
import { changedConfiguration, type ScmIntegrationChange, type ScmIntegrations, type StoredScmConfiguration } from '../ports/scm-integrations.js';
import { InMemoryScmIntegrationAudit } from './in-memory-scm-integration-audit.js';

// The store in memory, for tests and tools; writes run one at a time in
// `exclusive`, which a binding put shares, as a row lock would serialize.
export class InMemoryScmIntegrations implements ScmIntegrations {
  readonly #stored = new Map<ScmIntegrationId, StoredScmConfiguration>();
  readonly #audit: ScmIntegrationAudit;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(audit: ScmIntegrationAudit = new InMemoryScmIntegrationAudit()) {
    this.#audit = audit;
  }

  // Runs `work` after every earlier exclusive work has settled.
  exclusive<Value>(work: () => Promise<Value>): Promise<Value> {
    const run = this.#queue.then(work);
    this.#queue = run.catch(() => undefined);
    return run;
  }

  add(integration: ScmIntegration, secrets: ScmSecrets, audit: ScmIntegrationAuditEntry): Promise<Result<ScmIntegration>> {
    return this.exclusive(async () => {
      if (this.#stored.has(integration.integrationId)) return err(failure('conflict', 'the integration identifier is taken'));
      return this.#keepAudited({ integration, secrets }, creationAudit(integration, audit));
    });
  }

  async get(integrationId: ScmIntegrationId): Promise<Result<ScmIntegration | undefined>> {
    return ok(this.#stored.get(integrationId)?.integration);
  }

  async page(after: string | undefined, limit: number): Promise<Result<readonly ScmIntegration[]>> {
    const ids = [...this.#stored.keys()].filter((id) => after === undefined || codeUnitOrder(id, after) > 0).sort(codeUnitOrder);
    return ok(ids.slice(0, limit).map((id) => this.#stored.get(id)!.integration));
  }

  update(integrationId: ScmIntegrationId, change: ScmIntegrationChange, audit: ScmIntegrationAuditEntry): Promise<Result<ScmIntegration>> {
    return this.exclusive(async () => {
      const stored = this.#stored.get(integrationId);
      if (stored === undefined) return err(failure('not-found', 'no SCM integration has this identifier'));
      if (stored.integration.revision !== change.expectedRevision) return err(failure('conflict', 'the integration changed since its revision'));
      const changed = changedConfiguration(stored, change);
      return this.#keepAudited(changed, changeAudit(stored.integration, changed.integration, change, audit));
    });
  }

  async configurationOf(integrationId: ScmIntegrationId): Promise<Result<StoredScmConfiguration | undefined>> {
    return ok(this.#stored.get(integrationId));
  }

  // Keeps nothing when the audit refuses its row, as a rollback would.
  async #keepAudited(stored: StoredScmConfiguration, event: ScmIntegrationAuditEvent): Promise<Result<ScmIntegration>> {
    const appended = await this.#audit.append(event);
    return appended.ok ? ok(this.#keep(stored)) : appended;
  }

  #keep(stored: StoredScmConfiguration): ScmIntegration {
    const integration = Object.freeze({ ...stored.integration, settings: Object.freeze({ ...stored.integration.settings }) });
    this.#stored.set(integration.integrationId, { integration, secrets: stored.secrets });
    return integration;
  }
}

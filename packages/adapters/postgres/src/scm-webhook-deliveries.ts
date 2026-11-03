import { ok, type Result } from '@taskelith/kernel';
import type { DeliveryRecording, ScmIntegrationId, ScmWebhookDeliveries, WebhookEvent } from '@taskelith/integrations';
import type { PostgresDatabase } from './postgres-database.js';
import type { Session } from './session.js';

// Inside a transaction: the first record of a delivery inserts it, and a
// repeat of its identifier inserts nothing.
export class PostgresScmWebhookDeliveryRecords {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async record(integrationId: ScmIntegrationId, event: WebhookEvent): Promise<DeliveryRecording> {
    const { rowCount } = await this.#session.query(
      `INSERT INTO scm_webhook_deliveries (integration_id, delivery_id, kind, repository, change_request, commit_id)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (integration_id, delivery_id) DO NOTHING`,
      [integrationId, event.deliveryId, event.kind, event.repository, event.changeRequest ?? null, event.commit ?? null],
    );
    return rowCount === 1 ? 'recorded' : 'repeated';
  }
}

// Each record in its own SERIALIZABLE transaction: of two concurrent
// identical deliveries one inserts, and the other's retry finds it.
export class CommittingScmWebhookDeliveries implements ScmWebhookDeliveries {
  readonly #database: Pick<PostgresDatabase, 'transaction'>;

  constructor(database: Pick<PostgresDatabase, 'transaction'>) {
    this.#database = database;
  }

  record(integrationId: ScmIntegrationId, event: WebhookEvent): Promise<Result<DeliveryRecording>> {
    return this.#database.transaction(async (transaction) => ok(await transaction.scmWebhookDeliveries.record(integrationId, event)));
  }
}

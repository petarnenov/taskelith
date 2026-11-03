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
      [
        integrationId, codeUnits(event.deliveryId), event.kind, codeUnits(event.repository),
        optionalCodeUnits(event.changeRequest), optionalCodeUnits(event.commit),
      ],
    );
    return rowCount === 1 ? 'recorded' : 'repeated';
  }
}

// An external identifier as its UTF-16 code units, little-endian, which
// keeps a NUL and an unpaired surrogate that text columns cannot hold.
function codeUnits(identifier: string): Buffer {
  return Buffer.from(identifier, 'utf16le');
}

function optionalCodeUnits(identifier: string | undefined): Buffer | null {
  return identifier === undefined ? null : codeUnits(identifier);
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

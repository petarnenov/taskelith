import { err, failure, ok, type Result } from '@taskelith/kernel';
import {
  changedConfiguration,
  ScmSecrets,
  type NormalizedOrigin,
  type ScmIntegration,
  type ScmIntegrationChange,
  type ScmIntegrationId,
  type ScmIntegrations,
  type StoredScmConfiguration,
} from '@taskelith/integrations';
import type { PostgresDatabase } from './postgres-database.js';
import type { Session } from './session.js';

// One secret at rest: a random nonce and the ciphertext with its tag.
export interface SealedScmSecret {
  readonly nonce: Uint8Array;
  readonly sealed: Uint8Array;
}

// Encryption under a key outside the database; `open` answers undefined
// for a ciphertext that fails authentication.
export interface ScmSecretCipher {
  seal(text: string, context: string): SealedScmSecret;
  open(sealed: SealedScmSecret, context: string): string | undefined;
}

interface IntegrationRow {
  readonly integration_id: string;
  readonly plugin_id: string;
  readonly label: string;
  readonly allowed_origin: string;
  readonly settings: Record<string, string>;
  readonly revision: number;
  readonly secret_names: string[];
}

interface SecretRow {
  readonly name: string;
  readonly nonce: Buffer;
  readonly sealed: Buffer;
}

const SELECT_INTEGRATIONS = `SELECT integration_id, plugin_id, label, allowed_origin, settings, revision,
  ARRAY(SELECT name FROM scm_integration_secrets s WHERE s.integration_id = i.integration_id ORDER BY name COLLATE "C") AS secret_names
  FROM scm_integrations i`;

// The rows inside one transaction; the secrets stay sealed here.
export class PostgresScmIntegrationRecords {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async insert(integration: ScmIntegration): Promise<void> {
    const { integrationId, pluginId, label, allowedOrigin, settings, revision } = integration;
    await this.#session.query(`INSERT INTO scm_integrations (integration_id, plugin_id, label, allowed_origin, settings, revision)
      VALUES ($1, $2, $3, $4, $5, $6)`, [integrationId, pluginId, label, allowedOrigin, JSON.stringify(settings), revision]);
  }

  async get(integrationId: ScmIntegrationId): Promise<ScmIntegration | undefined> {
    const { rows } = await this.#session.query<IntegrationRow>(`${SELECT_INTEGRATIONS} WHERE integration_id = $1`, [integrationId]);
    return rows[0] === undefined ? undefined : integrationOf(rows[0]);
  }

  async page(after: string | undefined, limit: number): Promise<readonly ScmIntegration[]> {
    const { rows } = await this.#session.query<IntegrationRow>(`${SELECT_INTEGRATIONS}
      WHERE $1::text IS NULL OR integration_id COLLATE "C" > $1 ORDER BY integration_id COLLATE "C" LIMIT $2`, [after ?? null, limit]);
    return Object.freeze(rows.map(integrationOf));
  }

  // Only at `expectedRevision`; false when the revision moved.
  async replace(integration: ScmIntegration, expectedRevision: number): Promise<boolean> {
    const { integrationId, label, allowedOrigin, settings, revision } = integration;
    const { rowCount } = await this.#session.query(`UPDATE scm_integrations SET label = $2, allowed_origin = $3, settings = $4, revision = $5
      WHERE integration_id = $1 AND revision = $6`, [integrationId, label, allowedOrigin, JSON.stringify(settings), revision, expectedRevision]);
    return rowCount === 1;
  }

  async secrets(integrationId: ScmIntegrationId): Promise<readonly SecretRow[]> {
    const { rows } = await this.#session.query<SecretRow>('SELECT name, nonce, sealed FROM scm_integration_secrets WHERE integration_id = $1', [integrationId]);
    return rows;
  }

  async replaceSecrets(integrationId: ScmIntegrationId, sealed: ReadonlyMap<string, SealedScmSecret>): Promise<void> {
    await this.#session.query('DELETE FROM scm_integration_secrets WHERE integration_id = $1', [integrationId]);
    for (const [name, secret] of sealed) {
      await this.#session.query('INSERT INTO scm_integration_secrets (integration_id, name, nonce, sealed) VALUES ($1, $2, $3, $4)',
        [integrationId, name, Buffer.from(secret.nonce), Buffer.from(secret.sealed)]);
    }
  }
}

// Reads in read-only, changes in SERIALIZABLE transactions. A change
// re-seals every secret under the new revision, so no old row comes back.
export class PostgresScmIntegrations implements ScmIntegrations {
  readonly #database: Pick<PostgresDatabase, 'transaction' | 'readOnly'>;
  readonly #cipher: ScmSecretCipher;

  constructor(database: Pick<PostgresDatabase, 'transaction' | 'readOnly'>, cipher: ScmSecretCipher) {
    this.#database = database;
    this.#cipher = cipher;
  }

  add(integration: ScmIntegration, secrets: ScmSecrets): Promise<Result<ScmIntegration>> {
    return this.#database.transaction(async ({ scmIntegrations: records }) => {
      await records.insert(integration);
      await records.replaceSecrets(integration.integrationId, this.#sealed(integration, secrets));
      return ok((await records.get(integration.integrationId))!);
    });
  }

  get(integrationId: ScmIntegrationId): Promise<Result<ScmIntegration | undefined>> {
    return this.#database.readOnly(async ({ scmIntegrations: records }) => ok(await records.get(integrationId)));
  }

  page(after: string | undefined, limit: number): Promise<Result<readonly ScmIntegration[]>> {
    return this.#database.readOnly(async ({ scmIntegrations: records }) => ok(await records.page(after, limit)));
  }

  // Opens only the secrets the change keeps, so replacing a secret that no
  // longer opens recovers the integration.
  update(integrationId: ScmIntegrationId, change: ScmIntegrationChange): Promise<Result<ScmIntegration>> {
    return this.#database.transaction(async ({ scmIntegrations: records }) => {
      const current = await records.get(integrationId);
      if (current === undefined) return err(failure('not-found', 'no SCM integration has this identifier'));
      if (current.revision !== change.expectedRevision) return err(failure('conflict', 'the integration changed since its revision'));
      const replaced = new Set(change.secrets?.names());
      const kept = await this.#opened(records, current, (name) => !replaced.has(name));
      if (!kept.ok) return kept;
      const { integration, secrets } = changedConfiguration({ integration: current, secrets: kept.value }, change);
      if (!(await records.replace(integration, change.expectedRevision))) return err(failure('conflict', 'the integration changed since its revision'));
      await records.replaceSecrets(integrationId, this.#sealed(integration, secrets));
      return ok((await records.get(integrationId))!);
    });
  }

  configurationOf(integrationId: ScmIntegrationId): Promise<Result<StoredScmConfiguration | undefined>> {
    return this.#database.readOnly(async ({ scmIntegrations: records }) => {
      const integration = await records.get(integrationId);
      if (integration === undefined) return ok(undefined);
      const secrets = await this.#opened(records, integration, () => true);
      return secrets.ok ? ok({ integration, secrets: secrets.value }) : secrets;
    });
  }

  #sealed(integration: ScmIntegration, secrets: ScmSecrets): ReadonlyMap<string, SealedScmSecret> {
    const values = secrets.reveal();
    return new Map(secrets.names().map((name) => [name, this.#cipher.seal(values[name]!, sealingContext(integration, name))]));
  }

  async #opened(records: PostgresScmIntegrationRecords, integration: ScmIntegration, wanted: (name: string) => boolean): Promise<Result<ScmSecrets>> {
    const values: Record<string, string> = {};
    for (const row of (await records.secrets(integration.integrationId)).filter((secret) => wanted(secret.name))) {
      const opened = this.#cipher.open(row, sealingContext(integration, row.name));
      if (opened === undefined) return err(failure('internal', 'a stored SCM secret fails decryption', { setting: row.name }));
      values[row.name] = opened;
    }
    return ScmSecrets.of(values);
  }
}

// Binds a ciphertext to its integration, name, and revision.
function sealingContext({ integrationId, revision }: ScmIntegration, name: string): string {
  return `taskelith-scm-integration-secret\n${integrationId}\n${name}\n${revision}`;
}

function integrationOf(row: IntegrationRow): ScmIntegration {
  return Object.freeze({
    integrationId: row.integration_id as ScmIntegrationId,
    pluginId: row.plugin_id,
    label: row.label,
    allowedOrigin: row.allowed_origin as NormalizedOrigin,
    settings: Object.freeze({ ...row.settings }),
    secretNames: Object.freeze([...row.secret_names]),
    revision: row.revision,
  });
}

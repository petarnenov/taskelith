import type { HarnessPluginId } from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import {
  FIRST_SLOT_REVISION,
  SlotSecret,
  parseAccountSlot,
  parseSlotCredentialVersion,
  type AccountSlot,
  type AccountSlots,
  type CooldownSource,
  type ProjectId,
  type ProviderCredentialId,
  type SlotCredentialVersion,
  type SlotCredentials,
  type SlotHealth,
  type SlotState,
  type SubscriptionMechanismId,
} from '@taskelith/scheduling';
import { instant } from './capacity-repositories.js';
import type { TransactionWork } from './postgres-database.js';
import type { Session } from './session.js';

interface SlotRow {
  readonly slot_id: string;
  readonly harness_id: string;
  readonly mechanism_id: string;
  readonly credential_version: number;
  readonly allowed_projects: string[];
  readonly concurrency_limit: number;
  readonly state: string;
  readonly health: string;
  readonly cooldown_until: Date | null;
  readonly cooldown_source: string | null;
  readonly usage_fraction: number | null;
  readonly usage_window_ends_at: Date | null;
  readonly last_reserved_at: Date | null;
  readonly revision: number;
}

const COLUMNS = `slot_id, harness_id, mechanism_id, credential_version, allowed_projects, concurrency_limit, state, health,
  cooldown_until, cooldown_source, usage_fraction, usage_window_ends_at, last_reserved_at, revision`;

// Slot records in the reservation transaction (account pool contract 6.1).
export class PostgresAccountSlots implements AccountSlots {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async add(slot: AccountSlot): Promise<Result<void>> {
    if ((await this.#row(slot.id)) !== undefined) return err(exists(slot.id));
    if (slot.revision !== FIRST_SLOT_REVISION) return err(failure('invalid', 'a new slot starts at the first revision'));
    const { rowCount } = await this.#session.query(
      `INSERT INTO account_slots (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (slot_id) DO NOTHING`,
      columnValues(slot),
    );
    return rowCount === 1 ? ok(undefined) : err(exists(slot.id));
  }

  async get(id: ProviderCredentialId): Promise<Result<AccountSlot>> {
    const row = await this.#row(id);
    return row === undefined ? err(failure('not-found', 'no such slot', { slot: id })) : ok(slotOf(row));
  }

  async pool(projectId: ProjectId, harnessId: HarnessPluginId): Promise<readonly AccountSlot[]> {
    const { rows } = await this.#session.query<SlotRow>(
      `SELECT ${COLUMNS} FROM account_slots WHERE state = 'active' AND harness_id = $1 AND $2 = ANY (allowed_projects)
       ORDER BY slot_id COLLATE "C"`,
      [harnessId, projectId],
    );
    return Object.freeze(rows.map(slotOf));
  }

  // The checks run in the contract's order: not-found, invalid, conflict.
  async replace(slot: AccountSlot, expectedRevision: number): Promise<Result<void>> {
    const stored = await this.#row(slot.id);
    if (stored === undefined) return err(failure('not-found', 'no such slot', { slot: slot.id }));
    if (slot.harnessId !== stored.harness_id || (stored.state === 'removed' && slot.state !== 'removed')) {
      return err(failure('invalid', 'a slot keeps its harness and its tombstone'));
    }
    if (slot.revision !== expectedRevision + 1) return err(failure('invalid', 'a change moves the revision by one'));
    const { rowCount } = await this.#session.query(
      `UPDATE account_slots SET mechanism_id = $3, credential_version = $4, allowed_projects = $5, concurrency_limit = $6,
         state = $7, health = $8, cooldown_until = $9, cooldown_source = $10, usage_fraction = $11, usage_window_ends_at = $12,
         last_reserved_at = $13, revision = $14
       WHERE slot_id = $1 AND harness_id = $2 AND revision = $15`,
      [...columnValues(slot), expectedRevision],
    );
    return rowCount === 1 ? ok(undefined) : err(failure('conflict', 'the slot revision moved', { slot: slot.id }));
  }

  async countNotRemoved(harnessId: HarnessPluginId): Promise<number> {
    const { rows } = await this.#session.query<{ count: string }>(
      "SELECT count(*) AS count FROM account_slots WHERE harness_id = $1 AND state <> 'removed'", [harnessId],
    );
    return Number(rows[0]!.count);
  }

  async #row(id: ProviderCredentialId): Promise<SlotRow | undefined> {
    const { rows } = await this.#session.query<SlotRow>(`SELECT ${COLUMNS} FROM account_slots WHERE slot_id = $1`, [id]);
    return rows[0];
  }
}

function exists(id: ProviderCredentialId) {
  return failure('conflict', 'the slot exists', { slot: id });
}

function columnValues(slot: AccountSlot): unknown[] {
  return [
    slot.id, slot.harnessId, slot.mechanismId, slot.credentialVersion, [...slot.allowedProjects], slot.concurrencyLimit,
    slot.state, slot.health, slot.cooldown?.until ?? null, slot.cooldown?.source ?? null, slot.usage?.fraction ?? null,
    slot.usage?.windowEndsAt ?? null, slot.lastReservedAt ?? null, slot.revision,
  ];
}

// The table's checks keep the values within the record's invariants.
function slotOf(row: SlotRow): AccountSlot {
  const parsed = parseAccountSlot({
    id: row.slot_id as ProviderCredentialId,
    harnessId: row.harness_id as HarnessPluginId,
    mechanismId: row.mechanism_id as SubscriptionMechanismId,
    credentialVersion: row.credential_version as SlotCredentialVersion,
    allowedProjects: row.allowed_projects as ProjectId[],
    concurrencyLimit: row.concurrency_limit,
    state: row.state as SlotState,
    health: row.health as SlotHealth,
    ...(row.cooldown_until === null ? {} : { cooldown: { until: instant(row.cooldown_until), source: row.cooldown_source as CooldownSource } }),
    ...(row.usage_window_ends_at === null ? {} : { usage: { fraction: row.usage_fraction!, windowEndsAt: instant(row.usage_window_ends_at) } }),
    ...(row.last_reserved_at === null ? {} : { lastReservedAt: instant(row.last_reserved_at) }),
    revision: row.revision,
  });
  if (!parsed.ok) throw new Error(`stored slot ${row.slot_id} is invalid: ${parsed.error.message}`);
  return parsed.value;
}

// One credential version at rest: a random nonce, the ciphertext, its tag.
export interface SealedCredential {
  readonly nonce: Uint8Array;
  readonly sealed: Uint8Array;
}

// Encryption with a key outside the database; the context binds a version.
// `open` answers undefined for a ciphertext that fails authentication.
export interface SlotCredentialCipher {
  seal(text: string, context: string): SealedCredential;
  open(sealed: SealedCredential, context: string): string | undefined;
}

// Runs one SERIALIZABLE transaction, such as PostgresDatabase.transaction.
export type SlotCredentialTransactions = <Value>(work: TransactionWork<Value>) => Promise<Result<Value>>;

interface CounterRow {
  readonly last_version: number;
  readonly destroyed: boolean;
}

interface SealedRow {
  readonly nonce: Buffer;
  readonly sealed: Buffer;
}

export interface NextCredentialVersion {
  readonly version: SlotCredentialVersion;
  readonly destroyed: boolean;
}

// The rows of the encrypted credentials, which hold no plaintext.
export class PostgresSlotCredentialRecords {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async nextVersion(slotId: ProviderCredentialId): Promise<NextCredentialVersion> {
    const { rows } = await this.#session.query<CounterRow>(
      `INSERT INTO slot_credential_counters AS counter (slot_id, last_version, destroyed) VALUES ($1, 1, false)
       ON CONFLICT (slot_id) DO UPDATE SET last_version = counter.last_version + 1 RETURNING last_version, destroyed`,
      [slotId],
    );
    return { version: credentialVersion(rows[0]!.last_version), destroyed: rows[0]!.destroyed };
  }

  async insert(slotId: ProviderCredentialId, version: SlotCredentialVersion, sealed: SealedCredential): Promise<void> {
    await this.#session.query('INSERT INTO slot_credentials (slot_id, version, nonce, sealed) VALUES ($1, $2, $3, $4)',
      [slotId, version, Buffer.from(sealed.nonce), Buffer.from(sealed.sealed)]);
  }

  async get(slotId: ProviderCredentialId, version: SlotCredentialVersion): Promise<SealedCredential | undefined> {
    const { rows } = await this.#session.query<SealedRow>(
      'SELECT nonce, sealed FROM slot_credentials WHERE slot_id = $1 AND version = $2', [slotId, version],
    );
    return rows[0];
  }

  async delete(slotId: ProviderCredentialId, version: SlotCredentialVersion): Promise<void> {
    await this.#session.query('DELETE FROM slot_credentials WHERE slot_id = $1 AND version = $2', [slotId, version]);
  }

  async deleteOlderThan(slotId: ProviderCredentialId, version: SlotCredentialVersion): Promise<void> {
    await this.#session.query('DELETE FROM slot_credentials WHERE slot_id = $1 AND version < $2', [slotId, version]);
  }

  // The counter keeps its last version, so no version is reused.
  async destroy(slotId: ProviderCredentialId): Promise<void> {
    await this.#session.query(
      `INSERT INTO slot_credential_counters (slot_id, last_version, destroyed) VALUES ($1, 0, true)
       ON CONFLICT (slot_id) DO UPDATE SET destroyed = true`,
      [slotId],
    );
    await this.#session.query('DELETE FROM slot_credentials WHERE slot_id = $1', [slotId]);
  }
}

// Contract section 6.2: each operation commits in a transaction of its own,
// outside the reservation transaction; one that cannot commit rejects.
export class PostgresSlotCredentials implements SlotCredentials {
  readonly #transactions: SlotCredentialTransactions;
  readonly #cipher: SlotCredentialCipher;

  constructor(transactions: SlotCredentialTransactions, cipher: SlotCredentialCipher) {
    this.#transactions = transactions;
    this.#cipher = cipher;
  }

  // A destroyed slot still advances its counter and stores nothing.
  async store(slotId: ProviderCredentialId, secret: SlotSecret): Promise<SlotCredentialVersion> {
    return this.#run(async (records) => {
      const { version, destroyed } = await records.nextVersion(slotId);
      if (!destroyed) await records.insert(slotId, version, this.#cipher.seal(secret.reveal(), sealingContext(slotId, version)));
      return version;
    });
  }

  async reveal(slotId: ProviderCredentialId, version: SlotCredentialVersion): Promise<Result<SlotSecret>> {
    const sealed = await this.#run((records) => records.get(slotId, version));
    if (sealed === undefined) return err(failure('not-found', 'no such credential version', { slot: slotId }));
    const text = this.#cipher.open(sealed, sealingContext(slotId, version));
    if (text === undefined) return err(failure('internal', 'the stored credential fails decryption', { slot: slotId }));
    return SlotSecret.of(text);
  }

  async discard(slotId: ProviderCredentialId, version: SlotCredentialVersion): Promise<void> {
    await this.#run((records) => records.delete(slotId, version));
  }

  async discardOlderThan(slotId: ProviderCredentialId, version: SlotCredentialVersion): Promise<void> {
    await this.#run((records) => records.deleteOlderThan(slotId, version));
  }

  async destroy(slotId: ProviderCredentialId): Promise<void> {
    await this.#run((records) => records.destroy(slotId));
  }

  async #run<Value>(work: (records: PostgresSlotCredentialRecords) => Promise<Value>): Promise<Value> {
    const outcome = await this.#transactions(async (tx) => ok(await work(tx.slotCredentialRecords)));
    if (!outcome.ok) throw new Error(`slot credentials: ${outcome.error.message}`);
    return outcome.value;
  }
}

// Binds a ciphertext to its slot and version, so rows cannot be swapped.
function sealingContext(slotId: ProviderCredentialId, version: SlotCredentialVersion): string {
  return `taskelith-slot-credential\n${slotId}\n${version}`;
}

function credentialVersion(value: number): SlotCredentialVersion {
  const version = parseSlotCredentialVersion(value);
  if (!version.ok) throw new Error(version.error.message);
  return version.value;
}

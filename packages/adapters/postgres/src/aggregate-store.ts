import { err, failure, ok, type Result } from '@taskelith/kernel';
import { checkGeneration, checkNextGeneration, type Generation } from '@taskelith/sdlc';
import { encodeRecord } from './record-codec.js';
import type { Session } from './session.js';

// How one aggregate maps to its table: an id, a generation, query columns
// beside the JSON record, and the decoder that reads the record back.
export interface AggregateTable<Stored> {
  readonly table: string;
  readonly entity: string;
  idOf(record: Stored): string;
  generationOf(record: Stored): Generation;
  columnsOf(record: Stored): Readonly<Record<string, unknown>>;
  decode(json: unknown): Stored;
}

// `insertOnly` columns are written once, such as the run a gate belongs to.
export interface AddOptions {
  readonly insertOnly?: Readonly<Record<string, unknown>>;
  uniqueConflict?(): Promise<Result<void>>;
}

interface RecordRow {
  readonly record: unknown;
}

// The compare-and-set storage every repository shares. An insert that hits a
// unique constraint does nothing, so a transaction is not aborted by it.
export class AggregateStore<Stored> {
  readonly #session: Session;
  readonly #mapping: AggregateTable<Stored>;

  constructor(session: Session, mapping: AggregateTable<Stored>) {
    this.#session = session;
    this.#mapping = mapping;
  }

  async get(id: string): Promise<Result<Stored>> {
    const { rows } = await this.#session.query<RecordRow>(`SELECT record FROM ${this.#mapping.table} WHERE id = $1`, [id]);
    if (rows[0] === undefined) return this.#notFound(id);
    return ok(this.#mapping.decode(rows[0].record));
  }

  async list(where: string, values: readonly unknown[]): Promise<readonly Stored[]> {
    const { rows } = await this.#session.query<RecordRow>(`SELECT record FROM ${this.#mapping.table} WHERE ${where} ORDER BY id`, values);
    return rows.map((row) => this.#mapping.decode(row.record));
  }

  // Returns `conflict` for an existing id; `uniqueConflict` explains any
  // other unique constraint that rejected the row.
  async add(record: Stored, options: AddOptions = {}): Promise<Result<void>> {
    const id = this.#mapping.idOf(record);
    const columns = { ...this.#columns(record), ...options.insertOnly };
    const names = Object.keys(columns);
    const placeholders = names.map((_, index) => `$${index + 1}`);
    const inserted = await this.#session.query(
      `INSERT INTO ${this.#mapping.table} (${names.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT DO NOTHING`,
      Object.values(columns),
    );
    if (inserted.rowCount === 1) return ok(undefined);
    const existing = await this.#session.query(`SELECT 1 FROM ${this.#mapping.table} WHERE id = $1`, [id]);
    if (existing.rowCount === 1) {
      return err(failure('conflict', `${this.#mapping.entity} ${id} already exists`, { [this.#mapping.entity]: id }));
    }
    const conflict = (await options.uniqueConflict?.()) ?? ok(undefined);
    return conflict.ok ? err(failure('conflict', `${this.#mapping.entity} ${id} conflicts with a stored record`)) : conflict;
  }

  // Checks the stored generation first, as the in-memory adapters do, and
  // only then that the replacement carries the next one.
  async replace(record: Stored, expectedGeneration: Generation): Promise<Result<void>> {
    const id = this.#mapping.idOf(record);
    const next = checkNextGeneration(`${this.#mapping.entity} ${id}`, this.#mapping.generationOf(record), expectedGeneration);
    if (next.ok && await this.#update(record, expectedGeneration)) return ok(undefined);
    const { rows } = await this.#session.query<{ generation: string }>(`SELECT generation FROM ${this.#mapping.table} WHERE id = $1`, [id]);
    if (rows[0] === undefined) return this.#notFound(id);
    const stored = checkGeneration(`${this.#mapping.entity} ${id}`, Number(rows[0].generation) as Generation, expectedGeneration);
    return stored.ok ? next : stored;
  }

  async #update(record: Stored, expectedGeneration: Generation): Promise<boolean> {
    const columns = this.#columns(record);
    const names = Object.keys(columns).filter((name) => name !== 'id');
    const assignments = names.map((name, index) => `${name} = $${index + 3}`);
    const updated = await this.#session.query(
      `UPDATE ${this.#mapping.table} SET ${assignments.join(', ')} WHERE id = $1 AND generation = $2`,
      [this.#mapping.idOf(record), expectedGeneration, ...names.map((name) => columns[name])],
    );
    return updated.rowCount === 1;
  }

  #columns(record: Stored): Readonly<Record<string, unknown>> {
    return {
      id: this.#mapping.idOf(record),
      generation: this.#mapping.generationOf(record),
      ...this.#mapping.columnsOf(record),
      record: encodeRecord(record as object),
    };
  }

  #notFound(id: string): Result<never> {
    return err(failure('not-found', `${this.#mapping.entity} ${id} does not exist`, { [this.#mapping.entity]: id }));
  }
}

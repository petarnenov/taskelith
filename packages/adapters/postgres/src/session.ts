import type pg from 'pg';
import { StatementError } from './database-errors.js';

// The statements of one connection or transaction. Every failure becomes a
// StatementError, so the transaction runner can tell it from a defect.
export class Session {
  readonly #client: pg.ClientBase;

  constructor(client: pg.ClientBase) {
    this.#client = client;
  }

  async query<Row extends pg.QueryResultRow>(text: string, values: readonly unknown[] = []): Promise<pg.QueryResult<Row>> {
    try {
      return await this.#client.query<Row>(text, [...values]);
    } catch (error) {
      throw new StatementError(error);
    }
  }
}

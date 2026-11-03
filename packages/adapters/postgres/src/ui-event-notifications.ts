import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import pg from 'pg';
import { APPENDED_CHANNEL, NUMBERED_CHANNEL } from './ui-event-repositories.js';

type Listener = () => void;

// Provisional, in docs/operational-targets.md: how long the connection,
// and each LISTEN on it, may take before the attempt counts as lost.
export const LISTEN_DEADLINE_MILLISECONDS = 5_000;

// The log's wake-ups (appended, numbered) over one LISTEN connection, which
// `listen` reopens; readers also poll, so a missed one only delays them.
export class PostgresUiEventNotifications {
  readonly #url: URL;
  readonly #logger: Logger;
  readonly #deadlineMilliseconds: number;
  readonly #appended = new Set<Listener>();
  readonly #numbered = new Set<Listener>();
  #client: pg.Client | undefined;
  #connecting: pg.Client | undefined;
  #opening: Promise<boolean> | undefined;
  #cancelConnect: ((error: Error) => void) | undefined;
  #closed = false;

  constructor(url: URL, logger: Logger = SILENT_LOGGER, deadlineMilliseconds = LISTEN_DEADLINE_MILLISECONDS) {
    this.#url = url;
    this.#logger = logger;
    this.#deadlineMilliseconds = deadlineMilliseconds;
  }

  onAppended(listener: Listener): () => void {
    this.#appended.add(listener);
    return () => this.#appended.delete(listener);
  }

  onNumbered(listener: Listener): () => void {
    this.#numbered.add(listener);
    return () => this.#numbered.delete(listener);
  }

  // Opens the connection unless it is open, joining an opening one;
  // answers whether it is open.
  listen(): Promise<boolean> {
    if (this.#client !== undefined) return Promise.resolve(true);
    if (this.#closed) return Promise.resolve(false);
    this.#opening ??= this.#open().finally(() => {
      this.#opening = undefined;
    });
    return this.#opening;
  }

  // Ends the open connection and one still opening.
  async close(): Promise<void> {
    this.#closed = true;
    const clients = [this.#client, this.#connecting];
    this.#client = undefined;
    this.#cancelConnect?.(new Error('the listener closed'));
    await Promise.all(clients.map((client) => client?.end().catch(() => undefined)));
  }

  async #open(): Promise<boolean> {
    const client = new pg.Client({
      connectionString: this.#url.href, connectionTimeoutMillis: this.#deadlineMilliseconds, query_timeout: this.#deadlineMilliseconds,
    });
    client.on('error', (error) => this.#lost(client, error));
    client.on('notification', (message) => this.#notify(message.channel));
    this.#connecting = client;
    try {
      await this.#connect(client);
      await client.query(`LISTEN ${APPENDED_CHANNEL}`);
      await client.query(`LISTEN ${NUMBERED_CHANNEL}`);
    } catch (error) {
      this.#lost(client, error as Error);
      return false;
    } finally {
      this.#connecting = undefined;
      this.#cancelConnect = undefined;
    }
    if (this.#closed) {
      await client.end().catch(() => undefined);
      return false;
    }
    this.#client = client;
    return true;
  }

  // pg leaves `connect` pending when `end` interrupts it, so `close` also
  // rejects this wait.
  #connect(client: pg.Client): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#cancelConnect = reject;
      client.connect().then(() => resolve(), reject);
    });
  }

  #notify(channel: string): void {
    const listeners = channel === APPENDED_CHANNEL ? this.#appended : this.#numbered;
    for (const listener of listeners) listener();
  }

  #lost(client: pg.Client, error: Error): void {
    if (this.#client === client) this.#client = undefined;
    if (!this.#closed) this.#logger.warn('postgres.events.listen.lost', { cause: error.message });
    void client.end().catch(() => undefined);
  }
}

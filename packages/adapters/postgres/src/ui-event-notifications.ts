import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import pg from 'pg';
import { APPENDED_CHANNEL, NUMBERED_CHANNEL } from './ui-event-repositories.js';

type Listener = () => void;

// The log's wake-ups (appended, numbered) over one LISTEN connection, which
// `listen` reopens; readers also poll, so a missed one only delays them.
export class PostgresUiEventNotifications {
  readonly #url: URL;
  readonly #logger: Logger;
  readonly #appended = new Set<Listener>();
  readonly #numbered = new Set<Listener>();
  #client: pg.Client | undefined;
  #closed = false;

  constructor(url: URL, logger: Logger = SILENT_LOGGER) {
    this.#url = url;
    this.#logger = logger;
  }

  onAppended(listener: Listener): () => void {
    this.#appended.add(listener);
    return () => this.#appended.delete(listener);
  }

  onNumbered(listener: Listener): () => void {
    this.#numbered.add(listener);
    return () => this.#numbered.delete(listener);
  }

  // Opens the connection unless it is open; answers whether it is.
  async listen(): Promise<boolean> {
    if (this.#client !== undefined) return true;
    if (this.#closed) return false;
    const client = new pg.Client({ connectionString: this.#url.href });
    client.on('error', (error) => this.#lost(client, error));
    client.on('notification', (message) => this.#notify(message.channel));
    try {
      await client.connect();
      await client.query(`LISTEN ${APPENDED_CHANNEL}`);
      await client.query(`LISTEN ${NUMBERED_CHANNEL}`);
    } catch (error) {
      this.#lost(client, error as Error);
      return false;
    }
    if (this.#closed) {
      await client.end().catch(() => undefined);
      return false;
    }
    this.#client = client;
    return true;
  }

  async close(): Promise<void> {
    this.#closed = true;
    const client = this.#client;
    this.#client = undefined;
    await client?.end().catch(() => undefined);
  }

  #notify(channel: string): void {
    const listeners = channel === APPENDED_CHANNEL ? this.#appended : this.#numbered;
    for (const listener of listeners) listener();
  }

  #lost(client: pg.Client, error: Error): void {
    if (this.#client === client) this.#client = undefined;
    this.#logger.warn('postgres.events.listen.lost', { cause: error.message });
    void client.end().catch(() => undefined);
  }
}

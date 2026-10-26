import { launchRetryDelay } from '@taskelith/execution';
import type { Result } from '@taskelith/kernel';
import { SILENT_LOGGER, type Logger } from '@taskelith/observability';
import { TaskGroup } from './task-group.js';
import type { WorkerContact } from './worker-contact.js';

// One broker connection as the worker watches it.
export interface BrokerLink {
  // `disconnect` and `reconnect` change contact; it ends with the link.
  readonly statuses: AsyncIterable<{ readonly type: string }>;
  close(): Promise<void>;
}

export interface BrokerSessionOptions<Link extends BrokerLink> {
  readonly connect: () => Promise<Result<Link>>;
  // The work of one connection, until the signal aborts.
  readonly serve: (link: Link, signal: AbortSignal) => Promise<void>;
  // Each time the link is up, until it is down again.
  readonly linkUp: (link: Link, signal: AbortSignal) => Promise<void>;
  readonly contact: WorkerContact;
  readonly sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly draw: () => number;
  readonly logger?: Logger;
}

// Holds a broker connection until the worker stops: a failed connection,
// the first one included, is tried again, and so is a closed one.
export class BrokerSession<Link extends BrokerLink> {
  readonly #options: BrokerSessionOptions<Link>;
  readonly #logger: Logger;

  constructor(options: BrokerSessionOptions<Link>) {
    this.#options = options;
    this.#logger = options.logger ?? SILENT_LOGGER;
  }

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const link = await this.#connect(signal);
      if (link !== undefined) await this.#hold(link, signal);
    }
  }

  // The retry delays of a launch: 5 s doubling to 60 s, with jitter.
  async #connect(signal: AbortSignal): Promise<Link | undefined> {
    for (let retry = 1; !signal.aborted; retry += 1) {
      const connected = await this.#attempt(signal);
      if (connected === STOPPED) return undefined;
      if (connected.ok) return connected.value;
      this.#logger.warn('worker.broker.connect-failed', { retry, reason: connected.error.message });
      await this.#options.sleep(launchRetryDelay(retry, this.#options.draw()), signal);
    }
    return undefined;
  }

  // A stop does not wait for a pending attempt, which may wait on DNS
  // without a timeout; its late outcome is discarded.
  async #attempt(signal: AbortSignal): Promise<Result<Link> | typeof STOPPED> {
    const attempt = this.#options.connect();
    const connected = await settledUnlessAborted(attempt, signal);
    if (connected === STOPPED) void this.#discard(attempt);
    return connected;
  }

  async #discard(attempt: Promise<Result<Link>>): Promise<void> {
    try {
      const connected = await attempt;
      if (connected.ok) await connected.value.close();
    } catch (error) {
      this.#logger.warn('worker.broker.late-attempt-failed', { reason: (error as Error).message });
    }
  }

  // The link's work runs until the worker stops, the link closes, or a task
  // fails; the link is closed after every task of it ended.
  async #hold(link: Link, signal: AbortSignal): Promise<void> {
    const ended = new AbortController();
    const tasks = new TaskGroup(AbortSignal.any([signal, ended.signal]));
    try {
      tasks.add(this.#watch(link, tasks).finally(() => ended.abort()));
      tasks.add(this.#options.serve(link, tasks.signal));
      await tasks.settled();
    } finally {
      this.#options.contact.linkDown();
      await link.close();
    }
  }

  // Until the link's statuses end, or the tasks' signal aborts.
  async #watch(link: Link, tasks: TaskGroup): Promise<void> {
    let up = this.#up(link, tasks);
    const statuses = link.statuses[Symbol.asyncIterator]();
    for (;;) {
      const next = await nextUnlessAborted(statuses, tasks.signal);
      if (next.done === true) break;
      if (next.value.type === 'disconnect') {
        up.abort();
        this.#logger.debug('worker.broker.disconnected', {});
        this.#options.contact.linkDown();
      } else if (next.value.type === 'reconnect') {
        up.abort();
        this.#logger.debug('worker.broker.reconnected', {});
        up = this.#up(link, tasks);
      }
    }
    up.abort();
  }

  #up(link: Link, tasks: TaskGroup): AbortController {
    const up = new AbortController();
    this.#options.contact.linkUp();
    tasks.add(this.#options.linkUp(link, AbortSignal.any([tasks.signal, up.signal])));
    return up;
  }
}

const ENDED = { done: true as const, value: undefined };
const STOPPED = Symbol('stopped');

function settledUnlessAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T | typeof STOPPED> {
  if (signal.aborted) return Promise.resolve(STOPPED);
  return new Promise((resolve, reject) => {
    const abort = () => resolve(STOPPED);
    signal.addEventListener('abort', abort, { once: true });
    void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

// Each wait removes its own abort listener, so none accumulates.
function nextUnlessAborted<T>(iterator: AsyncIterator<T>, signal: AbortSignal): Promise<IteratorResult<T>> {
  if (signal.aborted) return Promise.resolve(ENDED);
  return new Promise((resolve, reject) => {
    const abort = () => resolve(ENDED);
    signal.addEventListener('abort', abort, { once: true });
    void iterator.next().then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

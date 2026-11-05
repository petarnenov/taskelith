import type { SessionTimelineTransaction } from '@taskelith/execution';
import type { Result } from '@taskelith/kernel';

// The store calls that only read; a call of any other name counts as a
// write, so that a new write is never taken for a read.
const READS: ReadonlySet<string> = new Set(['get', 'find', 'listByTask', 'listOpen', 'scopeOf', 'isCard', 'listByCard']);

type StoreCall = (...values: unknown[]) => Promise<Result<unknown>>;

// Whether a failure of the timeline left its stores as it found them.
export interface TimelineStoreWatch {
  isUntouched(): boolean;
}

// One transaction's timelines, noting each failed store call and each write,
// which tell a failure of the store from a refusal of the domain.
export class WatchedTimelineStores implements TimelineStoreWatch {
  readonly transaction: SessionTimelineTransaction;
  #failed = false;
  #wrote = false;

  constructor(transaction: SessionTimelineTransaction) {
    this.transaction = new Proxy(transaction, {
      get: (stores, name) => this.#watched(Reflect.get(stores, name) as object),
    });
  }

  // No store call failed and none wrote: nothing is left to roll back.
  isUntouched(): boolean {
    return !this.#failed && !this.#wrote;
  }

  #watched<Store extends object>(store: Store): Store {
    return new Proxy(store, {
      get: (records, name) => {
        const call: unknown = Reflect.get(records, name);
        return typeof call === 'function' ? this.#noted(String(name), (call as StoreCall).bind(records)) : call;
      },
    });
  }

  #noted(name: string, call: StoreCall): StoreCall {
    return async (...values) => {
      if (!READS.has(name)) this.#wrote = true;
      const result = await call(...values);
      if (!result.ok) this.#failed = true;
      return result;
    };
  }
}

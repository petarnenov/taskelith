import type { SessionTimelineTransaction } from '@taskelith/execution';
import type { Result } from '@taskelith/kernel';

type StoreCallKind = 'read' | 'write';

type StoreCallKinds = {
  readonly [Store in keyof SessionTimelineTransaction]: Readonly<Record<keyof SessionTimelineTransaction[Store], StoreCallKind>>;
};

// Every call of every timeline store: the compiler asks for a new one. A
// call that is not listed counts as a write, never the reverse.
const STORE_CALLS = {
  sessions: { get: 'read', add: 'write', replace: 'write', listByTask: 'read' },
  idempotency: { find: 'read', record: 'write' },
  items: { find: 'read', get: 'read', add: 'write', settle: 'write', listOpen: 'read' },
  audit: { append: 'write' },
  scopes: { scopeOf: 'read', isCard: 'read', listByCard: 'read' },
  tails: { get: 'read', put: 'write', clear: 'write' },
  events: { append: 'write' },
  commands: { append: 'write' },
} as const satisfies StoreCallKinds;

const CALL_KINDS: Readonly<Record<string, Readonly<Record<string, StoreCallKind>>>> = STORE_CALLS;

function isRead(store: string, call: string): boolean {
  return Object.hasOwn(CALL_KINDS, store) && CALL_KINDS[store]![call] === 'read';
}

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
      get: (stores, name) => {
        const member: unknown = Reflect.get(stores, name);
        return typeof member === 'object' && member !== null ? this.#watched(String(name), member) : member;
      },
    });
  }

  // No store call failed and none wrote: nothing is left to roll back.
  isUntouched(): boolean {
    return !this.#failed && !this.#wrote;
  }

  #watched<Store extends object>(storeName: string, store: Store): Store {
    return new Proxy(store, {
      get: (records, name) => {
        const call: unknown = Reflect.get(records, name);
        return typeof call === 'function' ? this.#noted(isRead(storeName, String(name)), (call as StoreCall).bind(records)) : call;
      },
    });
  }

  #noted(reads: boolean, call: StoreCall): StoreCall {
    return async (...values) => {
      if (!reads) this.#wrote = true;
      const result = await call(...values);
      if (!result.ok) this.#failed = true;
      return result;
    };
  }
}

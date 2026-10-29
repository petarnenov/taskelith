import type { PostgresDatabase } from '@taskelith/postgres';

// Each caller's promise resolves once `parties` callers have arrived.
export function rendezvous(parties: number): () => Promise<void> {
  let arrived = 0;
  let release!: () => void;
  const everyone = new Promise<void>((resolve) => { release = resolve; });
  return () => {
    arrived += 1;
    if (arrived === parties) release();
    return everyone;
  };
}

export interface GatedRead {
  readonly member: 'accountSlots' | 'ledger';
  readonly method: string;
  readonly arrive: () => Promise<void>;
}

// A capacity store whose transactions are PostgreSQL's, so it also serves
// the commands that read the grant index.
export type GatedTransactions = Pick<PostgresDatabase, 'transaction'>;

export interface GatedStore {
  readonly store: GatedTransactions;
  readonly attempts: () => number;
}

// Counts the transaction attempts; only the first one waits after the read
// for the other racers, so a retry runs without the gate.
export function gatedStore(database: PostgresDatabase, read: GatedRead): GatedStore {
  let attempts = 0;
  const store: GatedTransactions = {
    transaction: (work) => database.transaction((tx) => {
      attempts += 1;
      return work(attempts === 1 ? gatedMember(tx, read) : tx);
    }),
  };
  return { store, attempts: () => attempts };
}

export interface GatedFirstCall {
  readonly store: GatedTransactions;
  // Whether any one transaction ran its work more than once.
  readonly retried: () => boolean;
}

// Only the first call of the read waits for the other racers, in whichever
// transaction of a multi-transaction command it runs.
export function gatedFirstCall(database: PostgresDatabase, read: GatedRead): GatedFirstCall {
  let waited = false;
  let retried = false;
  const once: GatedRead = { ...read, arrive: () => (waited ? Promise.resolve() : (waited = true, read.arrive())) };
  const store: GatedTransactions = {
    transaction: (work) => {
      let runs = 0;
      return database.transaction((tx) => {
        runs += 1;
        retried ||= runs > 1;
        return work(gatedMember(tx, once));
      });
    },
  };
  return { store, retried: () => retried };
}

function gatedMember<Transaction extends object>(tx: Transaction, read: GatedRead): Transaction {
  const member = Reflect.get(tx, read.member) as object;
  const gated = boundProxy(member, read.method, (original) => async (...args: unknown[]) => {
    const result: unknown = await original(...args);
    await read.arrive();
    return result;
  });
  return boundProxy(tx, read.member, () => gated);
}

type Method = (...args: unknown[]) => unknown;

// Methods stay bound to the target, whose private fields a proxy lacks.
function boundProxy<Target extends object>(target: Target, key: string, replace: (original: Method) => unknown): Target {
  return new Proxy(target, {
    get: (object, property) => {
      const value: unknown = Reflect.get(object, property);
      const bound = typeof value === 'function' ? (value as Method).bind(object) : value;
      return property === key ? replace(bound as Method) : bound;
    },
  });
}

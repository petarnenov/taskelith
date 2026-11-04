// The retry records of this tab (decision Q4): the key and text of each
// unconfirmed submission, per session, so a reload keeps the key to retry.

export interface TurnRecord {
  readonly key: string;
  readonly text: string;
  readonly sentAt: string;
}

export interface TurnRecordStore {
  readonly list: (projectId: string, sessionId: string) => readonly TurnRecord[];
  readonly add: (projectId: string, sessionId: string, record: TurnRecord) => void;
  readonly remove: (projectId: string, sessionId: string, key: string) => void;
  // Drops the records of every session, as when the shell's session ends.
  readonly clearAll: () => void;
}

export const TURN_RECORD_PREFIX = 'taskelith-turn:';

// A session keeps this many records at most; the oldest leave first.
export const MAX_TURN_RECORDS = 20;

// Reads and writes go to the storage while it answers; from the first
// throw on, this page's records live in memory only.
export function createTurnRecordStore(storage: () => Storage = () => window.sessionStorage): TurnRecordStore {
  const memory = new Map<string, readonly TurnRecord[]>();
  let inMemory = false;

  function attempt<T>(use: (storage: Storage) => T, otherwise: () => T): T {
    if (!inMemory) {
      try {
        return use(storage());
      } catch {
        inMemory = true;
      }
    }
    return otherwise();
  }

  function read(name: string): readonly TurnRecord[] {
    return attempt(
      (store) => {
        const records = recordsOf(store.getItem(name));
        memory.set(name, records);
        return records;
      },
      () => memory.get(name) ?? [],
    );
  }

  function write(name: string, records: readonly TurnRecord[]): void {
    memory.set(name, records);
    attempt(
      (store) => store.setItem(name, JSON.stringify(records)),
      () => {},
    );
  }

  return {
    list: (projectId, sessionId) => read(nameOf(projectId, sessionId)),
    add: (projectId, sessionId, record) => {
      const name = nameOf(projectId, sessionId);
      write(name, [...read(name), record].slice(-MAX_TURN_RECORDS));
    },
    remove: (projectId, sessionId, key) => {
      const name = nameOf(projectId, sessionId);
      write(
        name,
        read(name).filter((record) => record.key !== key),
      );
    },
    // The storage is tried whatever threw before: a write over quota
    // leaves the stored text, which must not outlive the shell's session.
    clearAll: () => {
      memory.clear();
      try {
        removeAllRecords(storage());
      } catch {
        inMemory = true;
      }
    },
  };
}

function nameOf(projectId: string, sessionId: string): string {
  return `${TURN_RECORD_PREFIX}${projectId}/${sessionId}`;
}

function removeAllRecords(store: Storage): void {
  for (let index = store.length - 1; index >= 0; index -= 1) {
    const name = store.key(index);
    if (name !== null && name.startsWith(TURN_RECORD_PREFIX)) store.removeItem(name);
  }
}

// Stored text that is not a list of records reads as no record.
function recordsOf(text: string | null): readonly TurnRecord[] {
  if (text === null) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) && parsed.every(isTurnRecord) ? parsed : [];
  } catch {
    return [];
  }
}

function isTurnRecord(value: unknown): value is TurnRecord {
  if (typeof value !== 'object' || value === null) return false;
  const { key, text, sentAt } = value as Record<string, unknown>;
  return typeof key === 'string' && key !== '' && typeof text === 'string' && typeof sentAt === 'string';
}

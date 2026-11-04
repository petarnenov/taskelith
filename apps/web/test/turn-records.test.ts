import { beforeEach, describe, expect, it } from 'vitest';
import {
  createTurnRecordStore,
  MAX_TURN_RECORDS,
  TURN_RECORD_PREFIX,
  type TurnRecord,
} from '../src/agent-session/turn-records';

const SENT_AT = '2026-11-04T10:00:00.000Z';
const record = (key: string, text = `Message ${key}`): TurnRecord => ({ key, text, sentAt: SENT_AT });
const NAME = `${TURN_RECORD_PREFIX}project-1/session-1`;

// A storage whose named methods throw, as a browser that blocks storage;
// from the start, or only once `fail` is called, as a storage over quota.
function breakable(...methods: (keyof Storage)[]) {
  let failing = false;
  const storage = sessionStorage;
  const broken = new Proxy(storage, {
    get(target, property) {
      if (failing && typeof property === 'string' && methods.includes(property as keyof Storage)) {
        return () => {
          throw new DOMException('Storage is blocked.', 'SecurityError');
        };
      }
      const value = Reflect.get(target, property) as unknown;
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
  return {
    storage: () => broken,
    fail: () => {
      failing = true;
    },
  };
}

function throwing(...methods: (keyof Storage)[]): () => Storage {
  const broken = breakable(...methods);
  broken.fail();
  return broken.storage;
}

beforeEach(() => sessionStorage.clear());

describe('the turn record store', () => {
  it('keeps a session record under its own key, and lists none for another session', () => {
    const store = createTurnRecordStore();
    store.add('project-1', 'session-1', record('key-1'));
    expect(store.list('project-1', 'session-1')).toEqual([record('key-1')]);
    expect(store.list('project-1', 'session-2')).toEqual([]);
    expect(JSON.parse(sessionStorage.getItem(NAME) ?? '[]')).toEqual([record('key-1')]);
  });

  it('keeps the records of a/b + c apart from those of a + b/c', () => {
    const store = createTurnRecordStore();
    store.add('a/b', 'c', record('key-1'));
    store.add('a', 'b/c', record('key-2'));
    expect(store.list('a/b', 'c')).toEqual([record('key-1')]);
    expect(store.list('a', 'b/c')).toEqual([record('key-2')]);
    expect(Object.keys(sessionStorage).filter((name) => name.startsWith(TURN_RECORD_PREFIX))).toHaveLength(2);
  });

  it('reads the records a reload left in the storage, and removes one by its key', () => {
    sessionStorage.setItem(NAME, JSON.stringify([record('key-1'), record('key-2')]));
    const store = createTurnRecordStore();
    expect(store.list('project-1', 'session-1')).toEqual([record('key-1'), record('key-2')]);
    store.remove('project-1', 'session-1', 'key-1');
    expect(store.list('project-1', 'session-1')).toEqual([record('key-2')]);
    expect(createTurnRecordStore().list('project-1', 'session-1')).toEqual([record('key-2')]);
  });

  it('keeps at most the latest records of a session', () => {
    const store = createTurnRecordStore();
    for (let count = 1; count <= MAX_TURN_RECORDS + 1; count += 1) store.add('project-1', 'session-1', record(`key-${count}`));
    const keys = store.list('project-1', 'session-1').map((known) => known.key);
    expect(keys).toHaveLength(MAX_TURN_RECORDS);
    expect(keys[0]).toBe('key-2');
    expect(keys.at(-1)).toBe(`key-${MAX_TURN_RECORDS + 1}`);
  });

  it('clears the records of every session and leaves other keys', () => {
    const store = createTurnRecordStore();
    store.add('project-1', 'session-1', record('key-1'));
    store.add('project-2', 'session-9', record('key-2'));
    sessionStorage.setItem('other', 'kept');
    store.clearAll();
    expect(store.list('project-1', 'session-1')).toEqual([]);
    expect(store.list('project-2', 'session-9')).toEqual([]);
    expect(Object.keys(sessionStorage).filter((name) => name.startsWith(TURN_RECORD_PREFIX))).toEqual([]);
    expect(sessionStorage.getItem('other')).toBe('kept');
  });

  it.each([
    ['text that is not JSON', '{'],
    ['a record without a key', JSON.stringify([{ text: 'x', sentAt: SENT_AT }])],
    ['a record whose text is not text', JSON.stringify([{ key: 'k', text: 1, sentAt: SENT_AT }])],
    ['a record without a time', JSON.stringify([{ key: 'k', text: 'x' }])],
    ['an object instead of a list', JSON.stringify({ key: 'k' })],
  ])('reads %s as no record', (_, stored) => {
    sessionStorage.setItem(NAME, stored);
    expect(createTurnRecordStore().list('project-1', 'session-1')).toEqual([]);
  });

  it('keeps the records in memory when the storage cannot be reached', () => {
    const store = createTurnRecordStore(() => {
      throw new DOMException('Storage is blocked.', 'SecurityError');
    });
    expect(store.list('project-1', 'session-1')).toEqual([]);
    store.add('project-1', 'session-1', record('key-1'));
    store.add('project-1', 'session-1', record('key-2'));
    expect(store.list('project-1', 'session-1')).toEqual([record('key-1'), record('key-2')]);
    store.remove('project-1', 'session-1', 'key-1');
    expect(store.list('project-1', 'session-1')).toEqual([record('key-2')]);
    store.clearAll();
    expect(store.list('project-1', 'session-1')).toEqual([]);
    expect(sessionStorage.length).toBe(0);
  });

  it('keeps the records it read and the ones added since in memory once a write throws', () => {
    sessionStorage.setItem(NAME, JSON.stringify([record('key-1')]));
    const store = createTurnRecordStore(throwing('setItem'));
    expect(store.list('project-1', 'session-1')).toEqual([record('key-1')]);
    store.add('project-1', 'session-1', record('key-2'));
    expect(store.list('project-1', 'session-1')).toEqual([record('key-1'), record('key-2')]);
    expect(sessionStorage.getItem(NAME)).toBe(JSON.stringify([record('key-1')]));
  });

  it('still removes the stored records of every session on clearAll after a write threw', () => {
    const broken = breakable('setItem');
    const store = createTurnRecordStore(broken.storage);
    store.add('project-1', 'session-1', record('key-1'));
    store.add('project-2', 'session-9', record('key-2'));
    broken.fail();
    store.add('project-1', 'session-1', record('key-3'));
    expect(store.list('project-1', 'session-1')).toEqual([record('key-1'), record('key-3')]);
    store.clearAll();
    expect(store.list('project-1', 'session-1')).toEqual([]);
    expect(Object.keys(sessionStorage).filter((name) => name.startsWith(TURN_RECORD_PREFIX))).toEqual([]);
    const fresh = createTurnRecordStore();
    expect(fresh.list('project-1', 'session-1')).toEqual([]);
    expect(fresh.list('project-2', 'session-9')).toEqual([]);
  });

  it('clears the records in memory when the storage throws on removal', () => {
    const store = createTurnRecordStore(throwing('removeItem'));
    store.add('project-1', 'session-1', record('key-1'));
    store.clearAll();
    expect(store.list('project-1', 'session-1')).toEqual([]);
  });
});

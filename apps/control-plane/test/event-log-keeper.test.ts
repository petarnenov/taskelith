import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_EVENT_RETENTION_HOURS, EventLogKeeper, LogViewPositions, NUMBERING_BATCH, WakeableLoop } from '@taskelith/control-plane';
import { InMemoryUiEventLog } from '@taskelith/execution';
import { err, failure, ok, type Instant } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';
import { AT, ManualClock, ManualScheduler, eventEntry, marked } from './event-stream-fixtures.ts';

const HOUR = 3_600_000;

test('the assigner numbers every committed entry, a batch at a time, and answers how many', async () => {
  const log = new InMemoryUiEventLog();
  log.commit(Array.from({ length: NUMBERING_BATCH + 3 }, (_, index) => eventEntry(marked(index))));
  const keeper = new EventLogKeeper({ log, clock: new ManualClock() });
  assert.equal(value(await keeper.numberCommitted()), NUMBERING_BATCH + 3);
  assert.equal(value(await keeper.numberCommitted()), 0);
  assert.deepEqual(value(await log.bounds()), { floor: 0, head: NUMBERING_BATCH + 3 });
  const down = { assign: async () => err(failure('unavailable', 'down')), prune: (before: Instant, limit: number) => log.prune(before, limit) };
  const broken = new EventLogKeeper({ log: down, clock: new ManualClock() });
  assert.equal(failed(await broken.numberCommitted()).code, 'unavailable');
});

test('pruning removes the entries numbered before the retention window, 24 hours by default, and raises the floor', async () => {
  for (const [hours, expected] of [[undefined, DEFAULT_EVENT_RETENTION_HOURS], [2, 2]] as const) {
    const cutoffs: Instant[] = [];
    const clock = new ManualClock();
    const keeper = new EventLogKeeper({
      log: { assign: async () => err(failure('internal', 'unused')), prune: async (before: Instant) => (cutoffs.push(before), ok(7)) },
      clock, ...(hours === undefined ? {} : { retentionHours: hours }),
    });
    assert.equal(value(await keeper.prune()), 7);
    assert.deepEqual(cutoffs, [new Date(Date.parse(AT) - expected * HOUR).toISOString()]);
  }
  const log = new InMemoryUiEventLog();
  const clock = new ManualClock();
  log.commit([eventEntry(marked(1)), eventEntry(marked(2))]);
  value(await log.assign(10, clock.now()));
  clock.advance(DEFAULT_EVENT_RETENTION_HOURS * HOUR);
  const keeper = new EventLogKeeper({ log, clock });
  assert.equal(value(await keeper.prune()), 0, 'an entry exactly at the window stays');
  clock.advance(1);
  assert.equal(value(await keeper.prune()), 2);
});

test('a view\'s position is the head of the log when the read starts', async () => {
  const log = new InMemoryUiEventLog();
  const positions = new LogViewPositions(log);
  assert.equal(value(await positions.current()), '0');
  log.commit([eventEntry(marked(1)), eventEntry(marked(2))]);
  assert.equal(value(await positions.current()), '0', 'an entry is in a view\'s position only once numbered');
  value(await log.assign(10, AT));
  assert.equal(value(await positions.current()), '2');
  const broken = new LogViewPositions({ bounds: async () => err(failure('unavailable', 'down')) });
  assert.equal(failed(await broken.current()).code, 'unavailable');
});

test('a wakeable loop runs again when woken, also during its work, waits for the poll otherwise, and stops on abort', async () => {
  const scheduler = new ManualScheduler();
  const loop = new WakeableLoop(scheduler);
  const controller = new AbortController();
  const runs = counter();
  const running = loop.run(async () => {
    runs.add();
    if (runs.count === 2) loop.wake();
  }, controller.signal, 1_000);
  await runs.reached(1);
  await scheduler.armed(1_000);
  loop.wake();
  await runs.reached(3);
  await scheduler.armed(1_000);
  assert.equal(runs.count, 3, 'a wake during the second run runs a third, then the loop waits');
  assert.equal(scheduler.fire(1_000), 1);
  await runs.reached(4);
  await scheduler.armed(1_000);
  controller.abort();
  await running;
  assert.equal(runs.count, 4);
  assert.deepEqual(scheduler.delays(), [], 'the stopped loop holds no timer');
});

// A count that a test can await.
function counter() {
  const waiters: Array<{ count: number; resolve: () => void }> = [];
  const state = {
    count: 0,
    add() {
      state.count++;
      for (const waiter of waiters.filter((candidate) => candidate.count <= state.count)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve();
      }
    },
    reached(count: number): Promise<void> {
      return count <= state.count ? Promise.resolve() : new Promise((resolve) => waiters.push({ count, resolve }));
    },
  };
  return state;
}

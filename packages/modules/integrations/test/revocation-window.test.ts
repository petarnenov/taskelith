import assert from 'node:assert/strict';
import test from 'node:test';
import { awaitRefusal, REVOCATION_PROPAGATION_SECONDS, type ConformanceClock } from '@taskelith/integrations';
import { err, failure, ok, type Result } from '@taskelith/kernel';

// The wait for an ended version's refusal, on a fake clock only.

const WINDOW_MS = REVOCATION_PROPAGATION_SECONDS * 1000;
const FORBIDDEN = err(failure('forbidden', 'refused'));

class FakeClock implements ConformanceClock {
  time = 0;
  timeouts = 0;

  private readonly oversleepMs: number;

  constructor(oversleepMs = 0) {
    this.oversleepMs = oversleepMs;
  }

  now(): number {
    return this.time;
  }

  async sleep(milliseconds: number): Promise<void> {
    this.time += milliseconds + this.oversleepMs;
  }

  // Fires on the next turn unless cancelled, so only an attempt that never
  // answers loses the race.
  async timeout(milliseconds: number, signal: AbortSignal): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (signal.aborted) return;
    this.timeouts += 1;
    this.time += milliseconds;
  }
}

function answering(clock: FakeClock, durationMs: number, result: Result<unknown>) {
  let attempts = 0;
  const attempt = async () => {
    attempts += 1;
    clock.time += durationMs;
    return result;
  };
  return { attempt, attempts: () => attempts };
}

test('a refusal within the window is observed with its latency', async () => {
  const clock = new FakeClock();
  const probe = answering(clock, WINDOW_MS, FORBIDDEN);
  assert.deepEqual(await awaitRefusal(probe.attempt, clock, 0), { refusal: FORBIDDEN.error, latencyMs: WINDOW_MS, answeredLate: false });
});

test('a refusal that answers after the window is late', async () => {
  const clock = new FakeClock();
  const probe = answering(clock, WINDOW_MS + 1, FORBIDDEN);
  assert.deepEqual(await awaitRefusal(probe.attempt, clock, 0), { refusal: undefined, latencyMs: WINDOW_MS + 1, answeredLate: true });
});

test('a sleep that overshoots the window ends the wait without another attempt', async () => {
  const clock = new FakeClock(WINDOW_MS);
  const probe = answering(clock, 0, ok(undefined));
  assert.deepEqual(await awaitRefusal(probe.attempt, clock, 0), { refusal: undefined, latencyMs: WINDOW_MS + 1000, answeredLate: false });
  assert.equal(probe.attempts(), 1);
});

test('an already expired window makes no attempt', async () => {
  const clock = new FakeClock();
  clock.time = WINDOW_MS;
  const probe = answering(clock, 0, FORBIDDEN);
  assert.deepEqual(await awaitRefusal(probe.attempt, clock, 0), { refusal: undefined, latencyMs: WINDOW_MS, answeredLate: false });
  assert.equal(probe.attempts(), 0);
});

test('later probes share the ending of the first', async () => {
  const clock = new FakeClock();
  const slow = answering(clock, WINDOW_MS - 1, FORBIDDEN);
  assert.equal((await awaitRefusal(slow.attempt, clock, 0)).refusal, FORBIDDEN.error);
  const later = answering(clock, 2, FORBIDDEN);
  assert.deepEqual(await awaitRefusal(later.attempt, clock, 0), { refusal: undefined, latencyMs: WINDOW_MS + 1, answeredLate: true });
});

test('a probe that never answers is bounded by the window', { timeout: 5000 }, async () => {
  const clock = new FakeClock();
  const ending = await awaitRefusal(() => new Promise<Result<unknown>>(() => {}), clock, 0);
  assert.deepEqual(ending, { refusal: undefined, latencyMs: WINDOW_MS, answeredLate: true });
  assert.equal(clock.timeouts, 1);
});

test('an accepted version is retried until the window has passed', async () => {
  const clock = new FakeClock();
  const probe = answering(clock, 0, ok(undefined));
  assert.deepEqual(await awaitRefusal(probe.attempt, clock, 0), { refusal: undefined, latencyMs: WINDOW_MS, answeredLate: false });
  assert.equal(probe.attempts(), REVOCATION_PROPAGATION_SECONDS);
});

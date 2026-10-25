import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInstant, type Instant } from '@taskelith/kernel';
import type { Clock } from '@taskelith/sdlc';
import { SimulatedHost } from '@taskelith/testing';

const START = '2026-10-25T12:00:00.000Z' as Instant;

test('elapsed time advances the wall clock and both monotonic clocks', () => {
  const host = new SimulatedHost(START);
  host.elapse(1500);
  assert.equal(host.wallClock.now(), '2026-10-25T12:00:01.500Z');
  assert.equal(host.deadlineClock.readMilliseconds(), 1500);
  assert.equal(host.uptimeClock.readMilliseconds(), 1500);
});

test('a suspend counts on the deadline clock but not on the uptime clock', () => {
  const host = new SimulatedHost(START);
  host.elapse(1000);
  host.suspend(31_000);
  assert.equal(host.deadlineClock.readMilliseconds(), 32_000);
  assert.equal(host.uptimeClock.readMilliseconds(), 1000);
  assert.equal(host.wallClock.now(), '2026-10-25T12:00:32.000Z');
});

test('a wall clock shift in either direction leaves the monotonic clocks alone', () => {
  const host = new SimulatedHost(START);
  host.shiftWallClock(-6000);
  assert.equal(host.wallClock.now(), '2026-10-25T11:59:54.000Z');
  host.shiftWallClock(60_000);
  assert.equal(host.wallClock.now(), '2026-10-25T12:00:54.000Z');
  assert.equal(host.deadlineClock.readMilliseconds(), 0);
});

test('the wall clock serves as the SDLC module Clock port', () => {
  const clock: Clock = new SimulatedHost(START).wallClock;
  assert.deepEqual(parseInstant(clock.now()), { ok: true, value: START });
});

test('negative or fractional durations and unrepresentable times are rejected', () => {
  const host = new SimulatedHost(START);
  for (const duration of [-1, 0.5, Number.NaN]) {
    assert.throws(() => host.elapse(duration), RangeError);
    assert.throws(() => host.suspend(duration), RangeError);
  }
  assert.throws(() => host.shiftWallClock(0.5), RangeError);
  host.shiftWallClock(8.64e15);
  assert.throws(() => host.wallClock.now(), RangeError);
});

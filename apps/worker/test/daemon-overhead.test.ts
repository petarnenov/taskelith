import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { EventLoopLagWindow, type LoopDelayHistogram } from '@taskelith/node-observability';
import { failed, value } from '@taskelith/testing';
import { ProcessDaemonOverhead } from '@taskelith/worker';

// A histogram whose p99 a test sets, in nanoseconds.
class ScriptedHistogram implements LoopDelayHistogram {
  p99Nanoseconds = 0;
  count = 0;
  enabled = false;
  resets = 0;

  percentile(): number {
    return this.p99Nanoseconds;
  }

  reset(): void {
    this.resets += 1;
  }

  enable(): boolean {
    this.enabled = true;
    return true;
  }

  disable(): boolean {
    this.enabled = false;
    return true;
  }
}

test('the resident set size is read, and one that cannot be read is a failure', () => {
  const histogram = new ScriptedHistogram();
  const read = new ProcessDaemonOverhead(new EventLoopLagWindow(20, histogram), () => 300 * 2 ** 20);
  assert.equal(value(read.residentBytes()), 300 * 2 ** 20);
  const unreadable = new ProcessDaemonOverhead(new EventLoopLagWindow(20, histogram), () => {
    throw new Error('EMFILE');
  });
  assert.match(failed(unreadable.residentBytes()).message, /EMFILE/);
});

test('the production sensor reads its own process', () => {
  const sensor = new ProcessDaemonOverhead();
  assert.ok(value(sensor.residentBytes()) > 0);
  assert.ok(value(sensor.eventLoopLagMilliseconds()) >= 0);
});

test('the watch closes a lag window every interval and stops the histogram', async () => {
  const histogram = new ScriptedHistogram();
  const sensor = new ProcessDaemonOverhead(new EventLoopLagWindow(20, histogram), () => 0, 5);
  histogram.count = 10;
  histogram.p99Nanoseconds = 270e6;
  assert.equal(value(sensor.eventLoopLagMilliseconds()), 250);
  const controller = new AbortController();
  const watching = sensor.watch(controller.signal);
  for (let wait = 0; histogram.resets === 0 && wait < 100; wait += 1) await delay(5);
  histogram.p99Nanoseconds = 30e6;
  assert.equal(value(sensor.eventLoopLagMilliseconds()), 250, 'the closed window stands');
  controller.abort();
  await watching;
  assert.ok(histogram.resets >= 1);
  assert.equal(histogram.enabled, false);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { EventLoopLagWindow, type LoopDelayHistogram } from '@taskelith/node-observability';
import { failed, value } from '@taskelith/testing';
import { ProcessDaemonOverhead } from '@taskelith/worker';

// A histogram whose p99 a test sets, in nanoseconds; `failing` makes its
// reads throw.
class ScriptedHistogram implements LoopDelayHistogram {
  p99Nanoseconds = 0;
  count = 0;
  enabled = false;
  resets = 0;
  failing = false;

  percentile(): number {
    if (this.failing) throw new Error('histogram unreadable');
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

function sensorOver(histogram: ScriptedHistogram, intervalMilliseconds = 5): ProcessDaemonOverhead {
  return new ProcessDaemonOverhead(new EventLoopLagWindow(20, histogram), () => 300 * 2 ** 20, intervalMilliseconds);
}

async function untilClosed(histogram: ScriptedHistogram, resets: number): Promise<void> {
  for (let wait = 0; histogram.resets < resets && wait < 200; wait += 1) await delay(5);
  assert.ok(histogram.resets >= resets, 'the window never closed');
}

test('the resident set size is read, and one that cannot be read is a failure', () => {
  assert.equal(value(sensorOver(new ScriptedHistogram()).residentBytes()), 300 * 2 ** 20);
  const unreadable = new ProcessDaemonOverhead(new EventLoopLagWindow(20, new ScriptedHistogram()), () => {
    throw new Error('EMFILE');
  });
  assert.match(failed(unreadable.residentBytes()).message, /EMFILE/);
});

test('the histogram runs only while the watch does, and no sample is no measurement', async () => {
  const histogram = new ScriptedHistogram();
  const sensor = sensorOver(histogram);
  assert.equal(histogram.enabled, false, 'a sensor whose watch never starts holds no histogram');
  assert.match(failed(sensor.eventLoopLagMilliseconds()).message, /no event-loop delay was sampled/);
  const controller = new AbortController();
  const watching = sensor.watch(controller.signal);
  assert.equal(histogram.enabled, true);
  controller.abort();
  await watching;
  assert.equal(histogram.enabled, false);
});

test('the watch closes a lag window every interval and stops the histogram', async () => {
  const histogram = new ScriptedHistogram();
  const sensor = sensorOver(histogram);
  const controller = new AbortController();
  const watching = sensor.watch(controller.signal);
  histogram.count = 10;
  histogram.p99Nanoseconds = 270e6;
  assert.equal(value(sensor.eventLoopLagMilliseconds()), 250);
  await untilClosed(histogram, 1);
  histogram.p99Nanoseconds = 30e6;
  assert.equal(value(sensor.eventLoopLagMilliseconds()), 250, 'the closed window stands');
  controller.abort();
  await watching;
  assert.equal(histogram.enabled, false);
});

test('a histogram that cannot be read is unmeasured, and the watch goes on', async () => {
  const histogram = new ScriptedHistogram();
  const sensor = sensorOver(histogram);
  histogram.count = 10;
  histogram.failing = true;
  assert.match(failed(sensor.eventLoopLagMilliseconds()).message, /histogram unreadable/);
  const controller = new AbortController();
  const watching = sensor.watch(controller.signal);
  await delay(30);
  histogram.failing = false;
  histogram.p99Nanoseconds = 50e6;
  assert.match(failed(sensor.eventLoopLagMilliseconds()).message, /histogram unreadable/, 'a failed close stays unmeasured');
  await untilClosed(histogram, 1);
  assert.equal(value(sensor.eventLoopLagMilliseconds()), 30);
  controller.abort();
  await watching;
});

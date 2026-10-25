import assert from 'node:assert/strict';
import test from 'node:test';
import { Writable } from 'node:stream';
import { createHistogram, type RecordableHistogram } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { parseInstant } from '@taskelith/kernel';
import {
  EventLoopLagMonitor,
  JsonLinesLogSink,
  type LoopDelayHistogram,
  runPeriodically,
  SYSTEM_CLOCK,
} from '@taskelith/node-observability';
import { InMemoryMetrics, LOG_SINK_CONFORMANCE, Logger } from '@taskelith/observability';

function capturing(): { output: Writable; lines: string[] } {
  const lines: string[] = [];
  const output = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  return { output, lines };
}

test('the sink writes one JSON line per record', () => {
  const { output, lines } = capturing();
  const logger = new Logger(new JsonLinesLogSink(output), SYSTEM_CLOCK);
  logger.with({ attemptId: 'attempt-1' }).info('e.one', { n: 1 });
  logger.warn('e.two');
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => line.endsWith('\n') && !line.slice(0, -1).includes('\n')));
  const first = JSON.parse(lines[0]!);
  assert.deepEqual({ ...first, at: undefined }, { at: undefined, level: 'info', event: 'e.one', correlation: { attemptId: 'attempt-1' }, fields: { n: 1 } });
  assert.ok(parseInstant(first.at).ok);
});

test('an output that fails later loses records, not the process', async () => {
  const output = new Writable({ write: (_chunk, _encoding, done) => done(new Error('closed')) });
  const sink = new JsonLinesLogSink(output);
  const logger = new Logger(sink, SYSTEM_CLOCK);
  logger.error('e.first');
  await delay(10);
  assert.equal(sink.dropped, 1, 'the write that failed after it returned');
  logger.error('e.second');
  assert.equal(sink.dropped, 2);
});

test('an output that throws loses the record, not the caller', () => {
  const output = new Writable();
  output.write = () => { throw new Error('closed'); };
  const sink = new JsonLinesLogSink(output);
  new Logger(sink, SYSTEM_CLOCK).error('e');
  new Logger(sink, SYSTEM_CLOCK).error('e');
  assert.equal(sink.dropped, 2);
});

test('a full output drops records until it drains', async () => {
  const pending: Array<() => void> = [];
  const written: string[] = [];
  const output = new Writable({
    highWaterMark: 1,
    write(chunk: Buffer, _encoding, done) {
      written.push(chunk.toString());
      pending.push(done);
    },
  });
  const sink = new JsonLinesLogSink(output);
  const logger = new Logger(sink, SYSTEM_CLOCK);
  for (let index = 0; index < 1000; index++) logger.info('e.flood', { index });
  assert.equal(sink.dropped, 999);
  assert.ok(output.writableLength < 1000);
  pending.shift()!();
  await delay(10);
  logger.info('e.after-drain');
  assert.equal(sink.dropped, 999);
  assert.equal(written.length, 2);
});

test('the monitor reports the p99 event-loop delay of its window', async () => {
  const monitor = new EventLoopLagMonitor(5);
  const metrics = new InMemoryMetrics();
  try {
    await delay(20);
    monitor.sample(metrics);
    await delay(5).then(() => blockFor(60));
    await delay(20);
    monitor.sample(metrics);
  } finally {
    monitor.stop();
  }
  const lag = metrics.series('event-loop.lag')!;
  assert.ok(lag.last >= 0.03, `p99 ${lag.last}s should show the blocked loop`);
  assert.ok(Number.isFinite(lag.last));
});

// Node's own HDR histogram, filled with given timer intervals; a real idle
// window in a shared test process is not reliably idle.
class RecordedHistogram implements LoopDelayHistogram {
  readonly #histogram: RecordableHistogram = createHistogram();
  enabled = false;
  resets = 0;

  record(...milliseconds: number[]): void {
    for (const value of milliseconds) this.#histogram.record(Math.round(value * 1e6));
  }

  get count(): number {
    return this.#histogram.count;
  }

  percentile(percent: number): number {
    return this.#histogram.percentile(percent);
  }

  reset(): void {
    this.#histogram.reset();
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

// The histogram keeps three significant digits, so a recorded interval reads
// back within 0.1 % of itself.
const HDR_TOLERANCE_SECONDS = 1e-4;

test('an idle window reads below the resolution', () => {
  const histogram = new RecordedHistogram();
  const monitor = new EventLoopLagMonitor(10, histogram);
  const metrics = new InMemoryMetrics();
  assert.ok(histogram.enabled, 'the monitor enables its histogram');
  histogram.record(10.1, 10.2, 10.4, 10.1, 10.3, 10.2, 10.1, 10.6, 10.2, 10.3);
  monitor.sample(metrics);
  monitor.stop();
  const lag = metrics.series('event-loop.lag')!.last;
  assert.ok(lag >= 0 && lag < 0.01, `idle lag ${lag}s should stay below the 10 ms resolution`);
  assert.ok(Math.abs(lag - 0.0006) < HDR_TOLERANCE_SECONDS, 'the p99 interval less the resolution');
  assert.ok(!histogram.enabled, 'stop disables the histogram');
});

test('each sample covers only the window since the previous one', () => {
  const histogram = new RecordedHistogram();
  const monitor = new EventLoopLagMonitor(10, histogram);
  const metrics = new InMemoryMetrics();
  histogram.record(10, 10, 75);
  monitor.sample(metrics);
  assert.ok(Math.abs(metrics.series('event-loop.lag')!.last - 0.065) < HDR_TOLERANCE_SECONDS);
  histogram.record(10, 10.2);
  monitor.sample(metrics);
  monitor.stop();
  assert.equal(histogram.resets, 2);
  assert.ok(metrics.series('event-loop.lag')!.last < 0.01, 'the blocked interval of the first window is gone');
});

test('a window without a measured delay reports zero', () => {
  const monitor = new EventLoopLagMonitor();
  const metrics = new InMemoryMetrics();
  monitor.sample(metrics);
  monitor.stop();
  assert.equal(metrics.series('event-loop.lag')?.last, 0);
});

test('a periodic sample runs at once and stops when the signal aborts', async () => {
  const controller = new AbortController();
  let runs = 0;
  const running = runPeriodically(() => {
    runs += 1;
    if (runs === 3) controller.abort();
  }, controller.signal, 1);
  await running;
  assert.equal(runs, 3);
  await runPeriodically(() => assert.fail('an aborted loop samples nothing'), controller.signal);
});

test('a sample that throws ends the loop with its error', async () => {
  const controller = new AbortController();
  await assert.rejects(runPeriodically(() => { throw new Error('defect'); }, controller.signal), /defect/);
});

function blockFor(milliseconds: number): void {
  const until = Date.now() + milliseconds;
  while (Date.now() < until);
}

for (const conformance of LOG_SINK_CONFORMANCE) {
  test(`JSON-lines sink: ${conformance.name}`, async () => {
    assert.deepEqual(await conformance.check(new JsonLinesLogSink(capturing().output)), []);
  });
  test(`failing JSON-lines sink: ${conformance.name}`, async () => {
    const output = new Writable({ write: (_chunk, _encoding, done) => done(new Error('closed')) });
    assert.deepEqual(await conformance.check(new JsonLinesLogSink(output)), []);
  });
}

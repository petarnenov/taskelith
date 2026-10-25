import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { parseInstant } from '@taskelith/kernel';
import {
  EventLoopLagMonitor,
  JsonLinesLogSink,
  runPeriodically,
  SYSTEM_CLOCK,
} from '@taskelith/node-observability';
import { InMemoryMetrics, Logger } from '@taskelith/observability';

test('the sink writes one JSON line per record', () => {
  const lines: string[] = [];
  const logger = new Logger(new JsonLinesLogSink({ write: (chunk: string) => lines.push(chunk) }), SYSTEM_CLOCK);
  logger.with({ attemptId: 'attempt-1' }).info('e.one', { n: 1 });
  logger.warn('e.two');
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => line.endsWith('\n') && !line.slice(0, -1).includes('\n')));
  const first = JSON.parse(lines[0]!);
  assert.deepEqual({ ...first, at: undefined }, { at: undefined, level: 'info', event: 'e.one', correlation: { attemptId: 'attempt-1' }, fields: { n: 1 } });
  assert.ok(parseInstant(first.at).ok);
});

test('an output that throws loses the record, not the caller', () => {
  const sink = new JsonLinesLogSink({ write: () => { throw new Error('closed'); } });
  new Logger(sink, SYSTEM_CLOCK).error('e');
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
  assert.ok(lag.last < 5);
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

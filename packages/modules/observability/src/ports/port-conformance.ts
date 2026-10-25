import type { Instant } from '@taskelith/kernel';
import { expectSame, type ConformanceCase } from '@taskelith/sdlc';
import { LOG_LEVELS, type LogRecord } from '../domain/log-record.js';
import { G2_SIGNALS, measurement, type SignalName } from '../domain/signals.js';
import type { ControlPlaneSignals } from './control-plane-signals.js';
import type { LogSink } from './log-sink.js';
import type { Metrics } from './metrics.js';

// Shared suites that every adapter of the observability ports passes; the
// signal suite expects a state with nothing stored.

const AT = '2026-10-25T10:00:00.000Z' as Instant;

function attempt(problems: string[], label: string, command: () => void): void {
  try {
    command();
  } catch (error) {
    problems.push(`${label}: threw ${error instanceof Error ? error.message : String(error)}`);
  }
}

export const LOG_SINK_CONFORMANCE: readonly ConformanceCase<LogSink>[] = Object.freeze([
  {
    name: 'a record of every level is taken without throwing and left unchanged',
    async check(sink: LogSink) {
      const problems: string[] = [];
      for (const level of LOG_LEVELS) {
        const fields = { count: 1, ok: true, text: 'line\nbreak' };
        const record: LogRecord = Object.freeze({ at: AT, level, event: 'conformance.check', correlation: { attemptId: 'a' }, fields });
        attempt(problems, level, () => sink.write(record));
        expectSame(problems, `${level} record`, record.fields, { count: 1, ok: true, text: 'line\nbreak' });
      }
      return problems;
    },
  },
]);

export const METRICS_CONFORMANCE: readonly ConformanceCase<Metrics>[] = Object.freeze([
  {
    name: 'a measurement of every catalogue signal is taken without throwing',
    async check(metrics: Metrics) {
      const problems: string[] = [];
      for (const name of Object.keys(G2_SIGNALS) as SignalName[]) {
        attempt(problems, name, () => metrics.record(measurement(name, 1, { source: 'conformance' })));
        attempt(problems, `${name} again`, () => metrics.record(measurement(name, 0)));
      }
      return problems;
    },
  },
]);

export const CONTROL_PLANE_SIGNALS_CONFORMANCE: readonly ConformanceCase<ControlPlaneSignals>[] = Object.freeze([
  {
    name: 'an empty state reads zero for every age and count',
    async check(signals: ControlPlaneSignals) {
      const problems: string[] = [];
      const read = await signals.read();
      if (!read.ok) return [`read: expected success, got ${read.error.message}`];
      expectSame(problems, 'snapshot', read.value, {
        outboxLagSeconds: 0, outboxPending: 0, assignmentAgeSeconds: 0, offeredAssignments: 0,
        unknownExecutions: 0, eligibleSlots: 0, heldSlots: 0,
      });
      return problems;
    },
  },
]);

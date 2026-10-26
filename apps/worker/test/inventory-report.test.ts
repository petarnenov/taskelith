import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { checkMessageSchema } from '@taskelith/contracts';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { TRANSPORT_LIMITS, type Publication, type PublishOutcome } from '@taskelith/nats';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { value } from '@taskelith/testing';
import { publishInventory, reportInventoryOnConnection, type ConnectionReportOptions } from '@taskelith/worker';
import type { WorkerRoot } from '@taskelith/worker-journal';
import { flush, ManualTimers } from './contact-fakes.ts';
import { T0, offer, temporaryJournal } from './launch-fakes.ts';

let root: WorkerRoot;
let remove: () => void;
let published: Publication[];
let answers: Array<Result<PublishOutcome>>;
let timers: ManualTimers;
let sink: InMemoryLogSink;
let options: ConnectionReportOptions;

beforeEach(() => {
  ({ root, remove } = temporaryJournal());
  published = [];
  answers = [];
  timers = new ManualTimers();
  sink = new InMemoryLogSink();
  let reports = 0;
  options = {
    journal: root.journal, observationSubject: 'observations', now: () => T0, newReportId: () => `report-${(reports += 1)}`,
    publish: async (publication) => {
      const answer = answers.shift() ?? ok('stored');
      if (answer.ok) published.push(publication);
      return answer;
    },
    sleep: timers.sleep, draw: () => 0, logger: new Logger(sink, { now: () => T0 }),
  };
});

afterEach(() => remove());

function bodies(): Record<string, unknown>[] {
  return published.map(({ body }) => JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>);
}

test('an unsolicited report names no request and matches the contract', async () => {
  value(root.journal.recordCommand(offer()));
  value(await publishInventory(options));
  const [report] = bodies();
  assert.equal(checkMessageSchema('InventoryReported', report).ok, true);
  assert.equal('requestId' in (report ?? {}), false);
  assert.deepEqual([report?.reportId, published[0]?.messageId, published[0]?.subject], ['report-1', 'report-1.1', 'observations']);
  value(await publishInventory(options, 'request-7'));
  assert.equal(bodies()[1]?.requestId, 'request-7');
});

test('the report of a connection is tried again with backoff until published', async () => {
  answers = [err(failure('unavailable', 'no broker')), err(failure('unavailable', 'no broker'))];
  const signal = new AbortController().signal;
  const reported = reportInventoryOnConnection(options, signal);
  await flush();
  const first = TRANSPORT_LIMITS.retryInitialMilliseconds;
  assert.deepEqual(timers.waiting, [first]);
  timers.elapse(first);
  await flush();
  assert.deepEqual(timers.waiting, [first * 2]);
  timers.elapse(first * 2);
  await reported;
  assert.deepEqual(bodies().map(({ reportId }) => reportId), ['report-3']);
  assert.deepEqual(sink.records.map(({ fields }) => fields.attempt), [1, 2]);
});

test('a link that goes down ends the retries of its report', async () => {
  answers = [err(failure('unavailable', 'no broker'))];
  const link = new AbortController();
  const reported = reportInventoryOnConnection(options, link.signal);
  await flush();
  link.abort();
  await reported;
  assert.deepEqual([published, timers.waiting], [[], []]);
});

test('a link that goes down during a report publishes none of its later parts', async () => {
  for (let number = 1; number <= 257; number += 1) value(root.journal.recordCommand(offer(number)));
  let acknowledge: () => void = () => undefined;
  const held: ConnectionReportOptions = { ...options, publish: async (publication) => {
    published.push(publication);
    if (published.length > 1) return ok('stored');
    await new Promise<void>((resolve) => {
      acknowledge = resolve;
    });
    return ok('stored');
  } };
  const link = new AbortController();
  const reported = reportInventoryOnConnection(held, link.signal);
  await flush();
  assert.equal(published.length, 1);
  link.abort();
  acknowledge();
  await reported;
  assert.deepEqual([published.map(({ messageId }) => messageId), timers.waiting, sink.records], [['report-1.1'], [], []]);
});

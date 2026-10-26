import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import type { AdmissionPressureCause, OutboxBacklog, WorkerJournal } from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { failed, value } from '@taskelith/testing';
import { ADMISSION_LIMITS, AdmissionPressure, pressureCauses } from '@taskelith/worker';
import type { VolumeSpace } from '@taskelith/worker-journal';
import { T0, temporaryJournal } from './launch-fakes.ts';

const GIBIBYTE = 2 ** 30;
const MEBIBYTE = 2 ** 20;
const AMPLE: Result<VolumeSpace> = ok({ availableBytes: 50 * GIBIBYTE, totalBytes: 100 * GIBIBYTE });
const EMPTY_OUTBOX: Result<OutboxBacklog> = ok({ entries: 0, bytes: 0 });
const UNREADABLE = err(failure('unavailable', 'statfs failed'));

let journal: WorkerJournal;
let remove: () => void;
let space: Result<VolumeSpace>;
let truncations: Result<number>[];
let sink: InMemoryLogSink;
let pressure: AdmissionPressure;

beforeEach(() => {
  const temporary = temporaryJournal();
  remove = temporary.remove;
  journal = temporary.root.journal;
  space = AMPLE;
  truncations = [];
  sink = new InMemoryLogSink();
  pressure = new AdmissionPressure({
    journal, space: () => space, truncateLogs: () => truncations.shift() ?? ok(0), logger: new Logger(sink, { now: () => T0 }),
  });
});

afterEach(() => remove());

function causes(spaceRead: Result<VolumeSpace>, backlog: Result<OutboxBacklog> = EMPTY_OUTBOX): AdmissionPressureCause[] {
  return pressureCauses(spaceRead, backlog, ADMISSION_LIMITS);
}

function reported(): unknown[] {
  return value(journal.dueForPublication(T0)).flatMap(({ fact }) => (fact.kind === 'admission-pressure-changed' ? [fact.causes] : []));
}

test('the disk floor is 5 GiB or 10% of the volume, whichever is larger', () => {
  assert.deepEqual(causes(ok({ availableBytes: 5 * GIBIBYTE, totalBytes: 20 * GIBIBYTE })), []);
  assert.deepEqual(causes(ok({ availableBytes: 5 * GIBIBYTE - 1, totalBytes: 20 * GIBIBYTE })), ['disk-floor']);
  assert.deepEqual(causes(ok({ availableBytes: 100 * GIBIBYTE, totalBytes: 1000 * GIBIBYTE })), []);
  assert.deepEqual(causes(ok({ availableBytes: 99 * GIBIBYTE, totalBytes: 1000 * GIBIBYTE })), ['disk-floor']);
});

test('the backlog limit is 10,000 unconfirmed entries or 256 MiB', () => {
  assert.deepEqual(causes(AMPLE, ok({ entries: 10_000, bytes: 256 * MEBIBYTE })), []);
  assert.deepEqual(causes(AMPLE, ok({ entries: 10_001, bytes: 0 })), ['journal-backlog']);
  assert.deepEqual(causes(AMPLE, ok({ entries: 1, bytes: 256 * MEBIBYTE + 1 })), ['journal-backlog']);
});

test('a limit that cannot be measured counts as exceeded, and causes keep the contract order', () => {
  assert.deepEqual(causes(UNREADABLE), ['unmeasurable-limit']);
  assert.deepEqual(causes(UNREADABLE, UNREADABLE), ['unmeasurable-limit']);
  const full = ok({ availableBytes: 0, totalBytes: 100 * GIBIBYTE });
  assert.deepEqual(causes(full, ok({ entries: 10_001, bytes: 0 })), ['disk-floor', 'journal-backlog']);
});

test('the first refresh reports the causes, and a later one only when they change', () => {
  assert.deepEqual(value(pressure.refresh()), []);
  assert.deepEqual(value(pressure.refresh()), []);
  space = UNREADABLE;
  assert.deepEqual(value(pressure.refresh()), ['unmeasurable-limit']);
  space = AMPLE;
  assert.deepEqual(value(pressure.refresh()), []);
  assert.deepEqual(reported(), [[], ['unmeasurable-limit'], []]);
  const changes = sink.records.filter((record) => record.event === 'worker.admission-pressure.changed');
  assert.deepEqual(changes.map((record) => record.fields.causes), ['', 'unmeasurable-limit', '']);
});

test('below the floor each refresh truncates the buffered logs and logs what it did', () => {
  space = ok({ availableBytes: 0, totalBytes: 100 * GIBIBYTE });
  truncations = [ok(2), err(failure('unavailable', 'permission denied')), ok(0)];
  for (let refresh = 0; refresh < 3; refresh += 1) assert.deepEqual(value(pressure.refresh()), ['disk-floor']);
  assert.deepEqual(truncations, []);
  const events = sink.records.map((record) => record.event).filter((event) => event.startsWith('worker.logs.'));
  assert.deepEqual(events, ['worker.logs.truncated', 'worker.logs.not-truncated']);
  assert.deepEqual(reported(), [['disk-floor']]);
});

test('a change that fails to commit is reported again by the next refresh', () => {
  const failing = recordingWith(journal, () => err(failure('unavailable', 'the journal is stopped')));
  const stopped = new AdmissionPressure({ journal: failing, space: () => space, truncateLogs: () => ok(0) });
  assert.equal(failed(stopped.refresh()).message, 'the journal is stopped');
  const working = new AdmissionPressure({ journal, space: () => space, truncateLogs: () => ok(0) });
  assert.deepEqual(value(working.refresh()), []);
  assert.deepEqual(reported(), [[]]);
});

test('the watch refreshes until aborted and logs a refresh that failed', async () => {
  const controller = new AbortController();
  let refreshes = 0;
  const failing = recordingWith(journal, () => {
    refreshes += 1;
    if (refreshes >= 3) controller.abort();
    return err(failure('unavailable', 'the journal is stopped'));
  });
  const watched = new AdmissionPressure({ journal: failing, space: () => space, truncateLogs: () => ok(0), logger: new Logger(sink, { now: () => T0 }) });
  await watched.watch(controller.signal, 1);
  assert.equal(refreshes, 3);
  assert.equal(sink.records.filter((record) => record.event === 'worker.admission-pressure.unreported').length, 3);
});

// The journal with its pressure commit replaced.
function recordingWith(source: WorkerJournal, record: WorkerJournal['recordAdmissionPressure']): WorkerJournal {
  return new Proxy(source, {
    get(target, property: string) {
      if (property === 'recordAdmissionPressure') return record;
      const member = Reflect.get(target, property) as unknown;
      return typeof member === 'function' ? member.bind(target) : member;
    },
  });
}

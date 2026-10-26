import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, test } from 'node:test';
import { checkMessageSchema } from '@taskelith/contracts';
import type { ExecutionProcess, WorkerJournal } from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { Publication, PublishOutcome } from '@taskelith/nats';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { value } from '@taskelith/testing';
import { containmentScan, LaunchOrchestrator, publishDueObservations, type PopulatedContainment } from '@taskelith/worker';
import { observationIdOf, SqliteWorkerJournal, type JournalDatabase, type WorkerRoot } from '@taskelith/worker-journal';
import { linuxPlatform } from '@taskelith/worker-supervisor';
import {
  FakeAuthority, FakeClock, FakePressure, FakeSupervisions, T0, temporaryJournal,
} from './launch-fakes.ts';

const PARENT = '/sys/fs/cgroup/taskelith';
const MEMBER: ExecutionProcess = { platform: 'linux', bootId: 'boot-1', pid: 77, startTime: 5, processGroupId: 77 };
const SQLITE_FULL = 13;

let root: WorkerRoot;
let journal: WorkerJournal;
let remove: () => void;
let records: Result<readonly string[]>;
let scanned: Result<readonly PopulatedContainment[]>;
let scans: number;
let failures: unknown[];
let sink: InMemoryLogSink;

beforeEach(() => {
  const temporary = temporaryJournal();
  root = temporary.root;
  journal = root.journal;
  remove = temporary.remove;
  records = ok([]);
  scanned = ok([]);
  scans = 0;
  failures = [];
  sink = new InMemoryLogSink();
});

afterEach(() => remove());

function populated(name: string, processes: readonly ExecutionProcess[] = [MEMBER]): PopulatedContainment {
  return { name, containment: `${PARENT}/${name}`, processes };
}

// A fresh orchestrator stands for a new worker process over the journal.
async function startProcess(): Promise<void> {
  const orchestrator = new LaunchOrchestrator({
    journal, authority: new FakeAuthority(), supervision: new FakeSupervisions().factory, clock: new FakeClock(),
    pressure: new FakePressure(),
    sleep: async () => undefined, draw: () => 0.5, newId: () => 'id-1',
    records: async () => records,
    containments: () => {
      scans += 1;
      return scanned;
    },
    logger: new Logger(sink, { now: () => T0 }),
    onFailure: (error) => failures.push(error),
  });
  const controller = new AbortController();
  await orchestrator.pass(controller.signal);
  await orchestrator.pass(controller.signal);
  await orchestrator.settled();
}

function unrecordedContainments(): string[] {
  return value(journal.dueForPublication(T0)).flatMap(({ fact }) => fact.kind === 'unrecorded-process' ? [fact.containment] : []);
}

test('a populated containment without a record directory is reported once per start', async () => {
  records = ok(['leftover-1']);
  scanned = ok([populated('lost-1'), populated('leftover-1')]);
  await startProcess();
  assert.equal(scans, 1);
  assert.deepEqual(unrecordedContainments(), [`${PARENT}/lost-1`]);
  const [entry] = value(journal.dueForPublication(T0)).filter(({ fact }) => fact.kind === 'unrecorded-process');
  assert.deepEqual(entry?.fact, { kind: 'unrecorded-process', containment: `${PARENT}/lost-1`, processes: [MEMBER] });
});

test('a leftover record is still only logged and kept, never an unrecorded process', async () => {
  records = ok(['leftover-1']);
  scanned = ok([populated('leftover-1')]);
  await startProcess();
  assert.deepEqual(unrecordedContainments(), []);
  assert.deepEqual(sink.records.filter(({ event }) => event === 'worker.execution.leftover').map(({ fields }) => fields['record']), ['leftover-1']);
});

test('a later start in the same journal incarnation emits nothing new', async () => {
  scanned = ok([populated('lost-1')]);
  await startProcess();
  await startProcess();
  assert.equal(scans, 2);
  assert.deepEqual(unrecordedContainments(), [`${PARENT}/lost-1`]);
});

test('a failed scan or record listing is reported, and nothing is journaled', async () => {
  scanned = err(failure('unavailable', 'the cgroup parent cannot be read'));
  await startProcess();
  assert.equal(failures.length, 1);
  records = err(failure('unavailable', 'the executions directory cannot be read'));
  scanned = ok([populated('lost-1')]);
  await startProcess();
  assert.equal(scans, 1);
  assert.deepEqual(unrecordedContainments(), []);
});

// The enrolled journal reopened, whose next `refusals` commits fail with
// SQLITE_FULL; `refused` counts the refusals it reports.
function fullJournal(refusals: number): { readonly full: SqliteWorkerJournal; readonly refused: () => number } {
  root.close();
  const real = new DatabaseSync(root.paths.journal);
  let left = refusals;
  let refused = 0;
  const handle: JournalDatabase = {
    exec: (sql) => {
      if (sql !== 'COMMIT' || left === 0) return real.exec(sql);
      left -= 1;
      throw Object.assign(new Error('database or disk is full'), { errcode: SQLITE_FULL });
    },
    prepare: (sql) => real.prepare(sql),
    close: () => real.close(),
    get isOpen() {
      return real.isOpen;
    },
  };
  const full = value(SqliteWorkerJournal.open(handle, { now: () => T0 }, { onSpaceRefused: () => (refused += 1) }));
  return { full, refused: () => refused };
}

test('an unrecorded process refused for lack of space is journaled once after the backoff', async (t) => {
  const { full, refused } = fullJournal(2);
  t.after(() => full.close());
  journal = full;
  const clock = new FakeClock();
  scanned = ok([populated('lost-1')]);
  const orchestrator = new LaunchOrchestrator({
    journal, supervision: new FakeSupervisions().factory, clock, pressure: new FakePressure(),
    sleep: async () => undefined, draw: () => 0.5, newId: () => 'id-1',
    records: async () => records,
    containments: () => {
      scans += 1;
      return scanned;
    },
    logger: new Logger(sink, { now: () => T0 }),
    onFailure: (error) => failures.push(error),
  });
  const pass = () => orchestrator.pass(new AbortController().signal);
  const backoffs = () => sink.records.filter(({ event }) => event === 'worker.journal.space-refused')
    .map(({ fields }) => fields['delayMilliseconds'] as number);
  await pass();
  await pass();
  assert.deepEqual([refused(), unrecordedContainments()], [1, []], 'no pass tries it within the backoff');
  clock.milliseconds += backoffs()[0]!;
  await pass();
  assert.deepEqual([refused(), unrecordedContainments()], [2, []]);
  clock.milliseconds += backoffs()[1]!;
  await pass();
  clock.milliseconds += 60_000;
  await pass();
  const entries = value(journal.dueForPublication(T0)).filter(({ fact }) => fact.kind === 'unrecorded-process');
  const fact = { kind: 'unrecorded-process' as const, containment: `${PARENT}/lost-1`, processes: [MEMBER] };
  assert.deepEqual(entries.map((entry) => [entry.fact, entry.position.observationId]),
    [[fact, observationIdOf(fact, journal.binding.journalId)]]);
  assert.deepEqual([scans, failures, backoffs().length], [1, [], 2]);
});

test('an unrecorded process is published as its AsyncAPI observation', async () => {
  value(journal.recordUnrecordedProcess(`${PARENT}/lost\u0007-1`, [MEMBER]));
  const published: unknown[] = [];
  const publish = async (publication: Publication): Promise<Result<PublishOutcome>> => {
    published.push(JSON.parse(new TextDecoder().decode(publication.body)));
    return ok('stored');
  };
  value(await publishDueObservations({ journal, publish, observationSubject: 'observations', now: () => T0 }));
  const body = published.at(-1) as { metadata: Record<string, unknown>; payload: unknown };
  const checked = checkMessageSchema('UnrecordedProcessObservation', body);
  assert.equal(checked.ok, true, checked.ok ? '' : checked.error.join('; '));
  assert.deepEqual(body.payload, { containment: `${PARENT}/lost -1`, processes: [MEMBER] });
  assert.equal(body.metadata['correlationId'], body.metadata['observationId']);
  assert.equal('attemptId' in body.metadata, false);
});

test('only a Linux host with a containment parent scans', () => {
  const linux = linuxPlatform({ containmentParent: PARENT });
  assert.equal(containmentScan({ ...linux, name: 'darwin' }, PARENT), undefined);
  assert.equal(containmentScan(linux, undefined), undefined);
  assert.equal(typeof containmentScan(linux, PARENT), 'function');
});

test('a Linux scan reports the members of each populated containment', { skip: process.platform !== 'linux' }, (t) => {
  const parent = mkdtempSync(join(tmpdir(), 'taskelith-cgroups-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  mkdirSync(join(parent, 'lost-1'));
  writeFileSync(join(parent, 'lost-1', 'cgroup.events'), 'populated 1\n');
  writeFileSync(join(parent, 'lost-1', 'cgroup.procs'), `${process.pid}\n`);
  const found = value(containmentScan(linuxPlatform({ containmentParent: parent }), parent)!());
  assert.deepEqual(found.map(({ name, containment }) => [name, containment]), [['lost-1', join(parent, 'lost-1')]]);
  const [member] = found[0]!.processes;
  assert.equal(member?.platform, 'linux');
  assert.equal(member?.pid, process.pid);
  assert.ok(member.processGroupId >= 1);
});

test('a failed Linux scan comes back as the failure', { skip: process.platform !== 'linux' }, (t) => {
  const parent = mkdtempSync(join(tmpdir(), 'taskelith-cgroups-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const file = join(parent, 'not-a-directory');
  writeFileSync(file, '');
  assert.equal(containmentScan(linuxPlatform({ containmentParent: file }), file)!().ok, false);
});

import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  describeHolder, HOLDER_FILE, isStale, liveQueue, lockDirectory, LOG_FILE, main, QUEUE, releaseTicket,
  stateDirectory, systemProcesses, takeTicket, UNRECORDED_TICKET_MS, waitForTurn, type Holder, type Processes,
} from '../scripts/docker-slot.ts';

const repository = resolve(import.meta.dirname, '..');
const script = join(repository, 'scripts', 'docker-slot.ts');
const NOW = Date.parse('2026-10-27T10:00:00Z');

function holder(pid: number, started = 'start-1'): Holder {
  return { pid, started, worktree: `/work/${pid}`, since: '2026-10-27T09:00:00.000Z' };
}

// Processes 1 to 99 are alive and started at start-1; others are gone.
const fakeProcesses: Processes = { alive: (pid) => pid < 100, started: () => 'start-1' };

function withLock(body: (lock: string, state: string) => void | Promise<void>): Promise<void> {
  const state = mkdtempSync(join(tmpdir(), 'taskelith-docker-slot-'));
  const lock = lockDirectory({ XDG_STATE_HOME: state });
  mkdirSync(lock, { recursive: true });
  return Promise.resolve(body(lock, state)).finally(() => rmSync(state, { recursive: true, force: true }));
}

test('the lock lives in the XDG state directory, or under HOME without one', () => {
  assert.equal(lockDirectory({ XDG_STATE_HOME: '/state' }), '/state/taskelith/docker-slot.lock');
  assert.equal(stateDirectory({ HOME: '/home/u' }), '/home/u/.local/state/taskelith');
  assert.equal(stateDirectory({ XDG_STATE_HOME: '', HOME: '/home/u' }), '/home/u/.local/state/taskelith');
});

test('tickets are numbered in arrival order and the lowest live one holds the slot', async () => {
  await withLock((lock) => {
    const first = takeTicket(lock, holder(1));
    const second = takeTicket(lock, holder(2));
    const third = takeTicket(lock, holder(3));
    assert.deepEqual([first.number, second.number, third.number], [1, 2, 3]);
    assert.deepEqual(liveQueue(lock, fakeProcesses, NOW, () => {}).map((entry) => entry.holder?.pid), [1, 2, 3]);
    releaseTicket(first);
    const fourth = takeTicket(lock, holder(4));
    assert.equal(fourth.number, 4);
    assert.deepEqual(liveQueue(lock, fakeProcesses, NOW, () => {}).map((entry) => entry.ticket.number), [2, 3, 4]);
  });
});

test('a ticket number taken by a concurrent run is skipped', async () => {
  await withLock((lock) => {
    takeTicket(lock, holder(1));
    mkdirSync(join(lock, QUEUE, '000000000002'));
    writeFileSync(join(lock, QUEUE, '000000000002', HOLDER_FILE), JSON.stringify(holder(2)));
    const ticket = takeTicket(lock, holder(3));
    assert.equal(ticket.number, 3);
  });
});

test('a dead holder, a reused process ID, and an old unrecorded ticket are stale', async () => {
  await withLock((lock) => {
    const dead = takeTicket(lock, holder(500));
    const reused = takeTicket(lock, holder(7, 'start-0'));
    const unknownStart = takeTicket(lock, holder(8, ''));
    const fresh = join(lock, QUEUE, '000000000010');
    mkdirSync(fresh);
    const old = join(lock, QUEUE, '000000000011');
    mkdirSync(old);
    const past = (NOW - UNRECORDED_TICKET_MS - 1000) / 1000;
    utimesSync(old, past, past);
    assert.equal(isStale(dead.path, fakeProcesses, NOW), true);
    assert.equal(isStale(reused.path, fakeProcesses, NOW), true);
    assert.equal(isStale(unknownStart.path, fakeProcesses, NOW), false);
    assert.equal(isStale(fresh, fakeProcesses, Date.now()), false);
    assert.equal(isStale(old, fakeProcesses, NOW), true);
    const logged: string[] = [];
    const queue = liveQueue(lock, fakeProcesses, NOW, (line) => logged.push(line));
    assert.deepEqual(queue.map((entry) => entry.ticket.number), [3, 10]);
    assert.deepEqual(logged, ['removed stale ticket=1 pid=500', 'removed stale ticket=2 pid=7', 'removed stale ticket=11 pid=unknown']);
    assert.equal(existsSync(dead.path), false);
  });
});

test('a waiter reports the holder once per holder and takes the slot after it', async () => {
  await withLock(async (lock) => {
    const first = takeTicket(lock, holder(1));
    const second = takeTicket(lock, holder(2));
    const mine = takeTicket(lock, holder(3));
    const reports: string[] = [];
    let clock = NOW;
    let polls = 0;
    // Each poll releases the holder after the first two polls.
    const sleep = async (ms: number): Promise<void> => {
      clock += ms;
      polls += 1;
      if (polls === 2) releaseTicket(first);
      if (polls === 3) releaseTicket(second);
    };
    const waited = await waitForTurn({
      lock, ticket: mine, processes: fakeProcesses, pollMs: 1000, now: () => clock, sleep,
      report: (line) => reports.push(line), log: () => {},
    });
    assert.equal(waited, 3000);
    assert.deepEqual(reports, [
      'docker slot: waiting, 2 ahead; held by pid 1 in /work/1 since 2026-10-27T09:00:00.000Z',
      'docker slot: waiting, 1 ahead; held by pid 2 in /work/2 since 2026-10-27T09:00:00.000Z',
    ]);
  });
});

test('a wait fails when its own ticket disappears', async () => {
  await withLock(async (lock) => {
    const mine = takeTicket(lock, holder(1));
    releaseTicket(mine);
    await assert.rejects(waitForTurn({
      lock, ticket: mine, processes: fakeProcesses, pollMs: 1, now: () => NOW, sleep: async () => {},
      report: () => {}, log: () => {},
    }), /ticket 1 vanished/);
  });
});

test('a holder without a record is described by its ticket', () => {
  assert.equal(describeHolder({ ticket: { number: 4, path: '/x' }, holder: undefined }), 'ticket 4');
});

test('the system probes see this process and no exited one', () => {
  assert.equal(systemProcesses.alive(process.pid), true);
  assert.notEqual(systemProcesses.started(process.pid), '');
  const exited = spawnSync('true');
  assert.equal(systemProcesses.alive(exited.pid ?? 0), false);
  assert.equal(systemProcesses.started(exited.pid ?? 0), '');
});

test('invalid arguments print the usage', async () => {
  const written: string[] = [];
  const write = process.stderr.write;
  process.stderr.write = ((chunk: string) => written.push(chunk)) as typeof process.stderr.write;
  try {
    assert.equal(await main(['run', 'true'], {}), 2);
    assert.equal(await main([], {}), 2);
  } finally {
    process.stderr.write = write;
  }
  assert.match(written.join(''), /^usage: docker-slot\.ts run -- <command>/);
});

interface Run {
  readonly child: ChildProcess;
  readonly stderr: () => string;
  readonly exited: Promise<number | null>;
}

function startRun(state: string, cwd: string, command: string): Run {
  const child = spawn(process.execPath, ['--experimental-strip-types', script, 'run', '--', 'sh', '-c', command], {
    cwd, env: { ...process.env, XDG_STATE_HOME: state, TASKELITH_DOCKER_SLOT_POLL_MS: '20' }, stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
  const exited = new Promise<number | null>((done) => child.on('exit', (code) => done(code)));
  return { child, stderr: () => stderr, exited };
}

// Polls a condition that another process makes true; the bound is far
// above the expected milliseconds.
async function until(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((done) => setTimeout(done, 20));
  }
}

function tickets(lock: string): string[] {
  return existsSync(join(lock, QUEUE)) ? readdirSync(join(lock, QUEUE)) : [];
}

function read(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

test('two runs hold the slot one after the other, in arrival order', async () => {
  await withLock(async (lock, state) => {
    const order = join(state, 'order');
    const go = join(state, 'go');
    const first = startRun(state, state, `echo first-start >> ${order}; while [ ! -f ${go} ]; do sleep 0.02; done; echo first-end >> ${order}`);
    await until(() => read(order).includes('first-start'), 'the first run');
    const second = startRun(state, repository, `echo second-start >> ${order}`);
    await until(() => second.stderr().includes('docker slot: waiting'), 'the second run to wait');
    assert.match(second.stderr(), new RegExp(`held by pid ${first.child.pid} in .*taskelith-docker-slot-`));
    writeFileSync(go, '');
    assert.deepEqual(await Promise.all([first.exited, second.exited]), [0, 0]);
    assert.deepEqual(read(order).trim().split('\n'), ['first-start', 'first-end', 'second-start']);
    assert.match(second.stderr(), /docker slot: acquired after \d+\.\d s/);
    const log = read(join(lock, '..', LOG_FILE));
    assert.match(log, /acquired ticket=1 pid=\d+ worktree=.* waited=\d+\.\ds/);
    assert.match(log, /released ticket=1 pid=\d+ held=\d+\.\ds status=0/);
    assert.match(log, /acquired ticket=2 /);
    assert.deepEqual(readdirSync(join(lock, QUEUE)), []);
  });
});

test('a run takes over the ticket of a killed holder and passes on its status', async () => {
  await withLock(async (lock, state) => {
    const exited = spawnSync('true');
    takeTicket(lock, holder(exited.pid ?? 0, ''));
    const run = startRun(state, state, 'exit 3');
    assert.equal(await run.exited, 3);
    assert.match(read(join(lock, '..', LOG_FILE)), /removed stale ticket=1 pid=\d+/);
  });
});

test('an interrupted waiter removes its ticket and the holder keeps the slot', async () => {
  await withLock(async (lock, state) => {
    const go = join(state, 'go');
    const first = startRun(state, state, `while [ ! -f ${go} ]; do sleep 0.02; done`);
    await until(() => tickets(lock).length === 1, 'the first ticket');
    const second = startRun(state, state, 'echo never');
    await until(() => second.stderr().includes('docker slot: waiting'), 'the second run to wait');
    second.child.kill('SIGTERM');
    assert.equal(await second.exited, 143);
    assert.deepEqual(readdirSync(join(lock, QUEUE)), ['000000000001']);
    assert.match(read(join(lock, '..', LOG_FILE)), /interrupted ticket=2 pid=\d+ signal=SIGTERM/);
    writeFileSync(go, '');
    assert.equal(await first.exited, 0);
  });
});

test('a signal to the holder reaches its command', async () => {
  await withLock(async (lock, state) => {
    const started = join(state, 'started');
    const run = startRun(state, state, `trap 'exit 7' TERM; touch ${started}; while :; do sleep 0.02; done`);
    await until(() => existsSync(started), 'the command to start');
    run.child.kill('SIGTERM');
    assert.equal(await run.exited, 7);
    assert.deepEqual(readdirSync(join(lock, QUEUE)), []);
  });
});

test('status names the holder and the waiters, or a free slot', async () => {
  await withLock(async (lock, state) => {
    const statusOf = (): string => spawnSync(process.execPath, ['--experimental-strip-types', script, 'status'], {
      encoding: 'utf8', env: { ...process.env, XDG_STATE_HOME: state },
    }).stdout;
    assert.equal(statusOf(), 'docker slot: free\n');
    takeTicket(lock, holder(process.pid, systemProcesses.started(process.pid)));
    takeTicket(lock, holder(process.pid, systemProcesses.started(process.pid)));
    assert.match(statusOf(), new RegExp(`^holder: pid ${process.pid} in /work/${process.pid} since .*\nwaiting 1: pid ${process.pid} `));
    const empty = mkdtempSync(join(tmpdir(), 'taskelith-docker-slot-empty-'));
    try {
      const fresh = spawnSync(process.execPath, ['--experimental-strip-types', script, 'status'], {
        encoding: 'utf8', env: { ...process.env, XDG_STATE_HOME: empty },
      });
      assert.equal(fresh.stdout, 'docker slot: free\n');
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

test('make test runs its services under the Docker slot', () => {
  const makefile = readFileSync(join(repository, 'Makefile'), 'utf8');
  const recipe = /^test:\n((?:\t.*\n)+)/m.exec(makefile)?.[1] ?? '';
  assert.match(recipe, /scripts\/docker-slot\.ts run -- \\\n\t+bash scripts\/services\.sh run \$\(VERIFY_SERVICES\) npm test/);
});

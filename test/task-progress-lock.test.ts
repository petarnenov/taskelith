import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { acquireLock, LOCK_MAX_AGE_SECONDS, processAlive, releaseLock } from '../scripts/task-progress-lock.ts';
import { readCache } from '../scripts/task-progress.ts';

const PROGRESS_MODULE = resolve(import.meta.dirname, '../scripts/task-progress.ts');
const NOW = new Date('2026-10-28T20:00:00Z');
const alive = (): boolean => true;
const at = (seconds: number): Date => new Date(NOW.getTime() + seconds * 1000);

function withDirectory(body: (lock: string) => void | Promise<void>): Promise<void> | void {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'taskelith-progress-lock-')));
  const done = (): void => rmSync(directory, { recursive: true, force: true });
  try {
    const result = body(join(directory, 'progress.lock'));
    if (result instanceof Promise) return result.finally(done);
    done();
  } catch (error) {
    done();
    throw error;
  }
}

function owner(lock: string): { pid: number; token: string } {
  return JSON.parse(readFileSync(lock, 'utf8')) as { pid: number; token: string };
}

function writeLock(lock: string, text: string): void {
  writeFileSync(lock, text);
  utimesSync(lock, NOW, NOW);
}

test('the lock names its owner and is released only with its token', () => withDirectory((lock) => {
  const held = acquireLock(lock, NOW, alive);
  assert.ok(held);
  assert.deepEqual(owner(lock), { pid: process.pid, token: held.token, createdAt: NOW.toISOString() });
  assert.equal(releaseLock({ path: lock, token: 'another' }), false);
  assert.equal(owner(lock).token, held.token, 'another token leaves it in place');
  assert.equal(releaseLock(held), true);
  assert.equal(existsSync(lock), false);
  assert.equal(releaseLock(held), false, 'nothing to release twice');
}));

test('a live lock younger than the maximum age is not taken over', () => withDirectory((lock) => {
  writeLock(lock, JSON.stringify({ pid: 4242, token: 'live' }));
  assert.equal(acquireLock(lock, at(LOCK_MAX_AGE_SECONDS - 1), alive), undefined);
  assert.equal(owner(lock).token, 'live');
}));

test('a dead owner\'s lock is taken over at once', () => withDirectory((lock) => {
  const exited = spawnSync(process.execPath, ['-e', '']);
  writeLock(lock, JSON.stringify({ pid: exited.pid, token: 'dead' }));
  const held = acquireLock(lock, at(1));
  assert.ok(held);
  assert.equal(owner(lock).token, held.token);
}));

test('a lock older than the maximum age is taken over, alive or unreadable', () => withDirectory((lock) => {
  for (const text of [JSON.stringify({ pid: 4242, token: 'reused' }), 'partial']) {
    writeLock(lock, text);
    assert.equal(acquireLock(lock, at(60), alive), undefined, `young: ${text}`);
    const held = acquireLock(lock, at(LOCK_MAX_AGE_SECONDS + 1), alive);
    assert.ok(held, `old: ${text}`);
    assert.equal(owner(lock).token, held.token);
  }
}));

test('a process that has exited is not alive', () => {
  const exited = spawnSync(process.execPath, ['-e', '']);
  assert.equal(processAlive(process.pid), true);
  assert.equal(processAlive(exited.pid!), false);
});

// Each writer rewrites the cache many times; a reader must only ever see
// a whole report. Arguments go by environment: modules read argv[1].
const WRITER = `
import { writeCache } from ${JSON.stringify(PROGRESS_MODULE)};
for (let index = 0; index < 200; index += 1) {
  const { PROGRESS_CACHE: cache = '', PROGRESS_WRITER: name = '' } = process.env;
  writeCache(cache, { generatedAt: 'x', generatedAtEpoch: index, problems: [name], hosts: [] });
}
`;

test('overlapping refreshes leave a whole cache', () => withDirectory(async (lock) => {
  const cache = join(lock, '..', 'progress.json');
  const writers = ['one', 'two', 'three', 'four'].map((name) => spawn(process.execPath, [
    '--experimental-strip-types', '--input-type=module', '-e', WRITER,
  ], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, PROGRESS_CACHE: cache, PROGRESS_WRITER: name } }));
  const exits = Promise.all(writers.map((writer) => once(writer, 'exit')));
  let running = true;
  void exits.then(() => { running = false; });
  let reads = 0;
  while (running) {
    if (existsSync(cache)) {
      assert.ok(readCache(cache), 'a reader saw a partial cache');
      reads += 1;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.deepEqual((await exits).map(([code]) => code), [0, 0, 0, 0]);
  assert.equal(readCache(cache)?.generatedAtEpoch, 199);
  assert.deepEqual(readdirSync(join(lock, '..')), ['progress.json'], `no temporary file remains after ${reads} reads`);
}));

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import test from 'node:test';
import {
  acquireLock, LOCK_MAX_AGE_SECONDS, LOCK_TIMEOUT_SECONDS, processAlive, releaseLock, TAKEOVER_TIMEOUT_SECONDS,
} from '../scripts/task-progress-lock.ts';

const LOCK_MODULE = resolve(import.meta.dirname, '../scripts/task-progress-lock.ts');
const NOW = new Date('2026-10-28T20:00:00Z');
const alive = (): boolean => true;
const dead = (): boolean => false;

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

test('the lock names its owner and only the owner releases it', () => withDirectory((lock) => {
  const held = acquireLock(lock, NOW, alive);
  assert.ok(held);
  assert.deepEqual(owner(lock), { pid: process.pid, token: held.token });
  assert.equal(acquireLock(lock, NOW, alive), undefined, 'a live owner keeps it');
  assert.equal(releaseLock({ path: lock, token: 'another' }), false);
  assert.equal(owner(lock).token, held.token, 'a stranger leaves it in place');
  assert.equal(releaseLock(held), true);
  assert.equal(existsSync(lock), false);
  assert.equal(releaseLock(held), false, 'nothing to release twice');
  assert.deepEqual(readdirSync(join(lock, '..')), [], 'no draft or aside file remains');
}));

test('a live owner keeps the lock until the maximum age; a dead one loses it', () => withDirectory((lock) => {
  writeFileSync(lock, JSON.stringify({ pid: 4242, token: 'old' }));
  utimesSync(lock, NOW, NOW);
  const at = (seconds: number): Date => new Date(NOW.getTime() + seconds * 1000);
  assert.equal(acquireLock(lock, at(2 * LOCK_TIMEOUT_SECONDS), alive), undefined, 'older than the timeout, alive');
  const stolen = acquireLock(lock, at(1), (pid) => pid !== 4242);
  assert.ok(stolen);
  assert.equal(owner(lock).token, stolen.token);
  utimesSync(lock, NOW, NOW);
  const reused = acquireLock(lock, at(LOCK_MAX_AGE_SECONDS + 1), alive);
  assert.ok(reused, 'a pid alive after the maximum age is taken as reused');
  assert.equal(releaseLock(stolen), false, 'the old owner leaves the new lock');
  assert.equal(owner(lock).token, reused.token);
}));

test('a takeover file left behind blocks takeovers only until its timeout', () => withDirectory((lock) => {
  writeFileSync(lock, JSON.stringify({ pid: 4242, token: 'old' }));
  writeFileSync(`${lock}.takeover`, '');
  utimesSync(`${lock}.takeover`, NOW, NOW);
  assert.equal(acquireLock(lock, NOW, dead), undefined);
  assert.ok(acquireLock(lock, new Date(NOW.getTime() + (TAKEOVER_TIMEOUT_SECONDS + 1) * 1000), dead));
  assert.equal(existsSync(`${lock}.takeover`), false);
}));

test('a lock without a readable owner is taken over only after the timeout', () => withDirectory((lock) => {
  writeFileSync(lock, 'partial');
  utimesSync(lock, NOW, NOW);
  assert.equal(acquireLock(lock, new Date(NOW.getTime() + 1000), dead), undefined);
  assert.ok(acquireLock(lock, new Date(NOW.getTime() + (LOCK_TIMEOUT_SECONDS + 1) * 1000), dead));
}));

test('a process that has exited is not alive', () => {
  const exited = spawnSync(process.execPath, ['-e', '']);
  assert.equal(processAlive(process.pid), true);
  assert.equal(processAlive(exited.pid!), false);
});

// Each child tries once, prints the result, and holds until stdin closes,
// so every attempt overlaps the holder's lifetime.
const CONTENDER = `
import { acquireLock, releaseLock } from ${JSON.stringify(LOCK_MODULE)};
const held = acquireLock(process.argv[1], new Date());
process.stdout.write(held ? 'held\\n' : 'blocked\\n');
process.stdin.resume();
process.stdin.on('end', () => { if (held) releaseLock(held); });
`;

async function contend(lock: string): Promise<string[]> {
  const contenders = Array.from({ length: 8 }, () => spawn(process.execPath, [
    '--experimental-strip-types', '--input-type=module', '-e', CONTENDER, lock,
  ], { stdio: ['pipe', 'pipe', 'inherit'] }));
  const answers = await Promise.all(contenders.map(async (child) => {
    const [chunk] = await once(child.stdout, 'data') as [Buffer];
    return chunk.toString().trim();
  }));
  const exits = contenders.map((child) => once(child, 'exit'));
  for (const child of contenders) child.stdin.end();
  await Promise.all(exits);
  return answers;
}

test('concurrent refreshes: exactly one process holds a free lock', () => withDirectory(async (lock) => {
  const answers = await contend(lock);
  assert.equal(answers.filter((answer) => answer === 'held').length, 1, answers.join(','));
  assert.equal(existsSync(lock), false, 'the holder released it');
}));

test('concurrent takeovers of a dead owner: exactly one process holds the lock', () => withDirectory(async (lock) => {
  const exited = spawnSync(process.execPath, ['-e', '']);
  writeFileSync(lock, JSON.stringify({ pid: exited.pid, token: 'dead' }));
  const answers = await contend(lock);
  assert.equal(answers.filter((answer) => answer === 'held').length, 1, answers.join(','));
  assert.deepEqual(readdirSync(join(lock, '..')), [], 'no lock, takeover, or draft file remains');
}));

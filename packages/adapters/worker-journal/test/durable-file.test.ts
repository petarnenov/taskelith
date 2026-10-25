import assert from 'node:assert/strict';
import { closeSync, mkdirSync, openSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { ScenarioProcess, failed, value } from '@taskelith/testing';
import { ExclusiveFileLock, createOnce, failureReason, replaceFile, syncBeforeUse, syncPath } from '@taskelith/worker-journal';
import { temporaryDataRoot } from './fixtures.ts';

let directory: string;
let remove: () => void;

beforeEach(() => {
  const temporary = temporaryDataRoot();
  ({ remove } = temporary);
  directory = dirname(temporary.dataRoot);
});

afterEach(() => remove());

test('create-once writes a complete private file and fails when the name exists', () => {
  const path = join(directory, 'launch');
  value(createOnce(path, 'first'));
  assert.equal(failed(createOnce(path, 'second')).code, 'conflict');
  assert.equal(readFileSync(path, 'utf8'), 'first');
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(directory), ['launch']);
});

test('replace swaps the content in one step, and a reader syncs a file before using it', () => {
  const path = join(directory, 'identity');
  value(replaceFile(path, 'old'));
  value(replaceFile(path, 'new'));
  assert.equal(readFileSync(path, 'utf8'), 'new');
  value(syncBeforeUse(path));
  assert.equal(failureReason(failed(syncPath(join(directory, 'missing')))), 'flush-failure');
});

// Qualification for the execution `lock` of item 4: the lock is a POSIX
// record lock, so another descriptor of the file in the holder releases it.
test('closing another descriptor of the lock file in the holder releases the lock', async () => {
  mkdirSync(join(directory, 'locks'));
  const lockFile = join(directory, 'locks', 'lock');
  const lock = value(ExclusiveFileLock.acquire(lockFile));
  try {
    assert.equal(await lockedForAnotherProcess(lockFile), true);
    closeSync(openSync(lockFile, 'r'));
    assert.equal(await lockedForAnotherProcess(lockFile), false);
  } finally {
    lock.release();
  }
});

async function lockedForAnotherProcess(lockFile: string): Promise<boolean> {
  const probe = await ScenarioProcess.start(process.execPath, [
    '--input-type=module',
    '-e',
    `import { ExclusiveFileLock } from '@taskelith/worker-journal';
     const lock = ExclusiveFileLock.acquire(${JSON.stringify(lockFile)});
     console.log(lock.ok ? 'free' : lock.error.details.reason);`,
  ], { cwd: process.cwd() });
  await probe.exited;
  return probe.stdout.trim() === 'root-locked';
}

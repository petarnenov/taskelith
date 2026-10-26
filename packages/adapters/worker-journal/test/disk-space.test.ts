import assert from 'node:assert/strict';
import { chmodSync, linkSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { failed, value } from '@taskelith/testing';
import { readVolumeSpace, truncateBufferedLogs } from '@taskelith/worker-journal';
import { temporaryDataRoot } from './fixtures.ts';

let base: string;
let remove: () => void;

beforeEach(() => {
  const temporary = temporaryDataRoot();
  base = temporary.dataRoot;
  remove = temporary.remove;
  mkdirSync(base, { recursive: true });
});

afterEach(() => remove());

test('the free space of a volume is read in bytes', () => {
  const space = value(readVolumeSpace(base));
  assert.ok(space.totalBytes > 0);
  assert.ok(space.availableBytes >= 0 && space.availableBytes <= space.totalBytes);
});

test('free space that cannot be read is a failure', () => {
  assert.equal(failed(readVolumeSpace(join(base, 'missing'))).code, 'unavailable');
});

test('buffered logs are emptied in place, nested ones too, and links are not followed', () => {
  const logs = join(base, 'logs');
  const outside = join(base, 'journal.sqlite');
  mkdirSync(join(logs, 'attempt-1'), { recursive: true });
  writeFileSync(join(logs, 'worker.log'), 'line\n');
  writeFileSync(join(logs, 'attempt-1', 'stdout.log'), 'output\n');
  writeFileSync(outside, 'journal');
  symlinkSync(outside, join(logs, 'linked.log'));
  symlinkSync(base, join(logs, 'linked-directory'));
  assert.equal(value(truncateBufferedLogs(logs)), 2);
  assert.equal(readFileSync(join(logs, 'worker.log'), 'utf8'), '');
  assert.equal(readFileSync(join(logs, 'attempt-1', 'stdout.log'), 'utf8'), '');
  assert.equal(readFileSync(outside, 'utf8'), 'journal');
});

test('a log directory that is a link is not followed', () => {
  const elsewhere = join(base, 'elsewhere');
  mkdirSync(elsewhere);
  writeFileSync(join(elsewhere, 'journal.sqlite'), 'journal');
  symlinkSync(elsewhere, join(base, 'logs'));
  assert.equal(value(truncateBufferedLogs(join(base, 'logs'))), 0);
  assert.equal(readFileSync(join(elsewhere, 'journal.sqlite'), 'utf8'), 'journal');
});

test('a hard link to a file outside the logs is left with its content', () => {
  const logs = join(base, 'logs');
  const journal = join(base, 'journal.sqlite');
  mkdirSync(logs);
  writeFileSync(journal, 'journal');
  linkSync(journal, join(logs, 'linked.log'));
  writeFileSync(join(logs, 'own.log'), 'output');
  assert.equal(value(truncateBufferedLogs(logs)), 1);
  assert.equal(readFileSync(journal, 'utf8'), 'journal');
  assert.equal(readFileSync(join(logs, 'own.log'), 'utf8'), '');
});

test('a missing log directory has nothing to truncate, and an unreadable one fails', () => {
  assert.equal(value(truncateBufferedLogs(join(base, 'missing'))), 0);
  const locked = join(base, 'locked');
  mkdirSync(locked);
  chmodSync(locked, 0o000);
  try {
    if (process.getuid?.() === 0) return;
    assert.equal(failed(truncateBufferedLogs(locked)).code, 'unavailable');
  } finally {
    chmodSync(locked, 0o700);
  }
});

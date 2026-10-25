import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { createOnceAsync, replaceFileAsync, syncPathAsync } from '@taskelith/data-root';

let base: string;
afterEach(() => rmSync(base, { recursive: true, force: true }));

function directory(): string {
  base = mkdtempSync(join(tmpdir(), 'taskelith-durable-'));
  return base;
}

test('a file is created once, owner-only, and replaced only on request', async () => {
  const path = join(directory(), 'content');
  assert.deepEqual(await createOnceAsync(path, Uint8Array.of(1, 2)), { ok: true, value: undefined });
  assert.equal(statSync(path).mode & 0o777, 0o600);
  const again = await createOnceAsync(path, Uint8Array.of(3));
  assert.equal(again.ok ? 'created' : again.error.code, 'conflict');
  assert.deepEqual([...readFileSync(path)], [1, 2]);
  assert.equal((await replaceFileAsync(path, Uint8Array.of(9))).ok, true);
  assert.deepEqual([...readFileSync(path)], [9]);
  assert.deepEqual(readdirSync(base), ['content'], 'no temporary is left behind');
});

test('a write or flush that cannot happen is a flush failure', async () => {
  const missing = join(directory(), 'absent', 'content');
  const written = await createOnceAsync(missing, Uint8Array.of(1));
  assert.equal(written.ok ? 'written' : written.error.details.reason, 'flush-failure');
  const flushed = await syncPathAsync(missing);
  assert.equal(flushed.ok ? 'flushed' : flushed.error.details.reason, 'flush-failure');
});

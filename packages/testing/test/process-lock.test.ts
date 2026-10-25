import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ScenarioProcess, acquireProcessLock } from '@taskelith/testing';

test('a second holder waits until the first releases', async () => {
  const release = await acquireProcessLock('harness-lock-test');
  const order: string[] = [];
  const second = acquireProcessLock('harness-lock-test').then((releaseSecond) => {
    order.push('second');
    return releaseSecond;
  });
  await new Promise((resolve) => setTimeout(resolve, 150));
  order.push('first released');
  await release();
  await (await second)();
  assert.deepEqual(order, ['first released', 'second']);
});

test('a lock left by a dead process is taken over, and a live holder times out the waiter', async () => {
  const gone = await ScenarioProcess.start(process.execPath, ['-e', '']);
  await gone.exited;
  await writeFile(join(tmpdir(), 'taskelith-harness-stale-test.lock'), String(gone.pid));
  const release = await acquireProcessLock('harness-stale-test');
  await assert.rejects(acquireProcessLock('harness-stale-test', 100), /is still held after 100 ms/);
  await release();
});

test('a lock name outside the allowed form is rejected', async () => {
  await assert.rejects(acquireProcessLock('../escape'), RangeError);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { ScenarioProcess, acquireProcessLock, lockPort, uncoveredEnvironment } from '@taskelith/testing';

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

test('of several waiters each holds the lock alone', async () => {
  let holders = 0;
  let overlap = false;
  await Promise.all([1, 2, 3].map(async () => {
    const release = await acquireProcessLock('harness-lock-race');
    holders += 1;
    overlap ||= holders > 1;
    await new Promise((resolve) => setTimeout(resolve, 60));
    holders -= 1;
    await release();
  }));
  assert.equal(overlap, false);
});

test('a killed holder frees the lock, and a live holder times out a waiter', async () => {
  const port = lockPort('harness-lock-kill');
  const holder = await ScenarioProcess.start(process.execPath, [
    '-e', `require('node:net').createServer().listen(${port}, '127.0.0.1', () => console.log('held'))`,
  ], { env: uncoveredEnvironment() });
  await holder.waitForOutput('held');
  await assert.rejects(acquireProcessLock('harness-lock-kill', 100), /is still held after 100 ms/);
  holder.kill();
  await holder.exited;
  await (await acquireProcessLock('harness-lock-kill', 5000))();
});

test('lock names map to a fixed port range, and other names are rejected', async () => {
  for (const name of ['toxiproxy-1', 'a', 'z-9']) {
    const port = lockPort(name);
    assert.ok(port >= 23_000 && port < 25_000, name);
    assert.equal(lockPort(name), port);
  }
  await assert.rejects(acquireProcessLock('../escape'), RangeError);
});

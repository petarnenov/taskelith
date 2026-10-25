import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';
import { ScenarioProcess } from '@taskelith/testing';

const TICKER = join(import.meta.dirname, 'fixtures', 'ticker.ts');

async function startTicker(): Promise<{ ticker: ScenarioProcess; pids: number[] }> {
  const ticker = await ScenarioProcess.start(process.execPath, ['--experimental-strip-types', TICKER]);
  await ticker.waitForOutput('\n');
  const pids = ticker.stdout.trim().split(' ').slice(1).map(Number);
  return { ticker, pids };
}

// `ps` reports T for a stopped process and nothing for one that is gone.
function processStates(pids: number[]): string[] {
  return pids.map((pid) => {
    try {
      return execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' }).trim().charAt(0);
    } catch {
      return 'gone';
    }
  });
}

test('pause stops the whole process group and resume continues it', async () => {
  const { ticker, pids } = await startTicker();
  try {
    ticker.pause();
    await waitUntil(() => processStates(pids).every((state) => state === 'T'));
    ticker.resume();
    await waitUntil(() => processStates(pids).every((state) => state !== 'T' && state !== 'gone'));
  } finally {
    ticker.kill();
  }
});

test('kill ends the whole process group, descendants included', async () => {
  const { ticker, pids } = await startTicker();
  ticker.kill();
  assert.deepEqual(await ticker.exited, { code: null, signal: 'SIGKILL' });
  await waitUntil(() => processStates(pids).every((state) => state === 'gone' || state === 'Z'));
});

test('a graceful signal reaches the process, and stderr is kept', async () => {
  const child = await ScenarioProcess.start(process.execPath, [
    '-e', "process.on('SIGTERM', () => { console.error('stopping'); process.exit(3); }); console.log('up'); setInterval(() => {}, 1000)",
  ]);
  await child.waitForOutput('up');
  child.kill('SIGTERM');
  assert.deepEqual(await child.exited, { code: 3, signal: null });
  assert.equal(child.stderr, 'stopping\n');
});

test('waiting for output that never comes fails when the process closes', async () => {
  const child = await ScenarioProcess.start(process.execPath, ['-e', "console.log('other')"]);
  await assert.rejects(child.waitForOutput('ready'), /closed before printing "ready"/);
});

test('a command that cannot start is reported', async () => {
  await assert.rejects(ScenarioProcess.start(join(import.meta.dirname, 'missing-command'), []), /ENOENT/);
});

async function waitUntil(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 250 && !condition(); attempt++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(condition(), 'condition not met within five seconds');
}

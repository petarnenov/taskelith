import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { ScenarioProcess } from '@taskelith/testing';
import { ProcessReaper, REAL_PROCESS_TEST_TIMEOUT } from './process-reaper.ts';

const SLEEP = ['-e', 'setTimeout(() => {}, 60000)'];

interface Started {
  readonly exited: Promise<unknown>;
  kill(): void;
}

// A detached process in its own session, as a supervisor or a child is; it
// joins `started` before its spawn is awaited, so that cleanup always sees it.
async function detached(args: readonly string[], started: Started[]): Promise<{ exited: Promise<NodeJS.Signals | null> }> {
  const child = spawn(process.execPath, [...args], { detached: true, stdio: 'ignore' });
  const exited = new Promise<NodeJS.Signals | null>((resolve) => child.once('exit', (_code, signal) => resolve(signal)));
  started.push({ exited, kill: () => child.kill('SIGKILL') });
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  return { exited };
}

async function scenario(args: readonly string[], started: Started[]): Promise<ScenarioProcess> {
  const scenarioProcess = await ScenarioProcess.start(process.execPath, args);
  started.push({ exited: scenarioProcess.exited, kill: () => killGroup(scenarioProcess) });
  return scenarioProcess;
}

function killGroup(scenarioProcess: ScenarioProcess): void {
  try {
    scenarioProcess.kill('SIGKILL');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

async function stopAll(started: readonly Started[]): Promise<void> {
  for (const entry of started) entry.kill();
  await Promise.all(started.map(({ exited }) => Promise.race([exited, delay(5_000, undefined, { ref: false })])));
}

test('the reaper kills every process that names its marker, tracked or not, and no other', { timeout: REAL_PROCESS_TEST_TIMEOUT }, async () => {
  const marker = mkdtempSync(join(tmpdir(), 'taskelith-reaper-'));
  const reaper = new ProcessReaper(marker);
  const started: Started[] = [];
  try {
    const untracked = await detached([...SLEEP, marker], started);
    const bystander = await detached(SLEEP, started);
    const tracked = reaper.track(await scenario([...SLEEP, marker], started));

    await reaper.reap();

    assert.deepEqual(await tracked.exited, { code: null, signal: 'SIGKILL' });
    assert.equal(await untracked.exited, 'SIGKILL');
    assert.equal(await Promise.race([bystander.exited, delay(100, 'running')]), 'running');
  } finally {
    await stopAll(started);
    rmSync(marker, { recursive: true, force: true });
  }
});

test('the reaper fails the teardown when a tracked process never closes', { timeout: REAL_PROCESS_TEST_TIMEOUT }, async () => {
  const marker = mkdtempSync(join(tmpdir(), 'taskelith-reaper-'));
  const reaper = new ProcessReaper(marker);
  const started: Started[] = [];
  // An unmarked member of its group keeps its output open after it is killed.
  const holder = `require('node:child_process').spawn(process.execPath, ${JSON.stringify(SLEEP)}, { stdio: 'inherit' }); setTimeout(() => {}, 60000);`;
  try {
    const tracked = reaper.track(await scenario(['-e', holder, marker], started));
    await delay(200);

    await assert.rejects(reaper.reap(), (error: AggregateError) => error.errors.some((entry: Error) => entry.message === `process ${tracked.pid} did not close within 5000 ms`));
  } finally {
    await stopAll(started);
    rmSync(marker, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ScenarioProcess } from '@taskelith/testing';
import { ProcessReaper, REAL_PROCESS_TEST_TIMEOUT } from './process-reaper.ts';

const SLEEP = ['-e', 'setTimeout(() => {}, 60000)'];

// A detached process in its own session, as a supervisor or a child is.
async function detached(args: readonly string[]): Promise<{ child: ChildProcess; exited: Promise<NodeJS.Signals | null> }> {
  const child = spawn(process.execPath, [...args], { detached: true, stdio: 'ignore' });
  const exited = new Promise<NodeJS.Signals | null>((resolve) => child.once('exit', (_code, signal) => resolve(signal)));
  await new Promise((resolve) => child.once('spawn', resolve));
  return { child, exited };
}

test('the reaper kills every process that names its marker, tracked or not, and no other', { timeout: REAL_PROCESS_TEST_TIMEOUT }, async () => {
  const marker = mkdtempSync(join(tmpdir(), 'taskelith-reaper-'));
  const reaper = new ProcessReaper(marker);
  const untracked = await detached([...SLEEP, marker]);
  const bystander = await detached(SLEEP);
  try {
    const tracked = reaper.track(await ScenarioProcess.start(process.execPath, [...SLEEP, marker]));

    await reaper.reap();

    assert.deepEqual(await tracked.exited, { code: null, signal: 'SIGKILL' });
    assert.equal(await untracked.exited, 'SIGKILL');
    assert.equal(bystander.child.exitCode, null);
    assert.equal(bystander.child.signalCode, null);
  } finally {
    untracked.child.kill('SIGKILL');
    bystander.child.kill('SIGKILL');
    rmSync(marker, { recursive: true, force: true });
  }
});

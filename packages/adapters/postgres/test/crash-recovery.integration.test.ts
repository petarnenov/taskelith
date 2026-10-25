import assert from 'node:assert/strict';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';
import { ScenarioProcess, crashEnvironment } from '@taskelith/testing';
import { createMigratedDatabase, query, truncateAll } from './test-database.ts';

const PLACEMENT = join(import.meta.dirname, 'fixtures', 'crashing-placement.ts');
const url = await createMigratedDatabase();
beforeEach(() => truncateAll(url));

async function placeWithCrashAt(point: string): Promise<{ signal: string | null; stdout: string }> {
  const child = await ScenarioProcess.start(process.execPath, ['--experimental-strip-types', PLACEMENT, url.href], {
    env: { ...process.env, ...crashEnvironment(point) },
  });
  const timer = setTimeout(() => child.kill(), 30_000);
  const exit = await child.exited.finally(() => clearTimeout(timer));
  assert.equal(child.stderr, '', `the placement process wrote to stderr (exit ${exit.code})`);
  return { signal: exit.signal, stdout: child.stdout };
}

async function stored(): Promise<{ assignments: number; outbox: number }> {
  const [row] = await query<{ assignments: number; outbox: number }>(url,
    'SELECT (SELECT count(*)::int FROM assignments) AS assignments, (SELECT count(*)::int FROM outbox) AS outbox');
  return row!;
}

// R05: a process killed at either side of the commit loses nothing that was
// committed and keeps nothing that was not; a rerun then completes once.
test('a process killed before the outbox commit leaves no state, and a rerun commits once', async () => {
  assert.deepEqual(await placeWithCrashAt('OutboxCommit.before'), { signal: 'SIGKILL', stdout: '' });
  assert.deepEqual(await stored(), { assignments: 0, outbox: 0 });
  const rerun = await placeWithCrashAt('InboxCommit.before');
  assert.deepEqual(rerun, { signal: null, stdout: '{"ok":true}\n' });
  assert.deepEqual(await stored(), { assignments: 1, outbox: 1 });
});

test('a process killed after the outbox commit keeps the placement, and a rerun is a conflict', async () => {
  assert.deepEqual(await placeWithCrashAt('OutboxCommit.after'), { signal: 'SIGKILL', stdout: '' });
  assert.deepEqual(await stored(), { assignments: 1, outbox: 1 });
  const rerun = await placeWithCrashAt('InboxCommit.before');
  assert.match(rerun.stdout, /"code":"conflict"/);
  assert.deepEqual(await stored(), { assignments: 1, outbox: 1 });
});

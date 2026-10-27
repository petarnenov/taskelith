import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import {
  CRASH_POINT_VARIABLE, CrashPoints, ScenarioProcess, SimulatedCrash, crashEnvironment, crashPointsFromEnvironment, uncoveredEnvironment,
} from '@taskelith/testing';

const JOURNAL_WRITER = join(import.meta.dirname, 'fixtures', 'journal-writer.ts');

test('an unarmed run records each point it reaches, in order', () => {
  const points = new CrashPoints();
  for (const point of ['CP1', 'W1.before', 'W1.after', 'W5s.before']) points.reach(point);
  assert.deepEqual(points.reached, ['CP1', 'W1.before', 'W1.after', 'W5s.before']);
});

test('an armed run throws at the armed occurrence and records the point', () => {
  const points = new CrashPoints({ point: 'W1.after', occurrence: 2, action: 'throw' });
  points.reach('W1.before');
  points.reach('W1.after');
  points.reach('W1.before');
  assert.throws(() => points.reach('W1.after'), (error: unknown) => error instanceof SimulatedCrash && error.point === 'W1.after');
  assert.deepEqual(points.reached, ['W1.before', 'W1.after', 'W1.before', 'W1.after']);
});

test('malformed point names and occurrences are rejected', () => {
  for (const point of ['', 'cp1', 'CP 1', 'W1.during', 'W1.before.after']) {
    assert.throws(() => new CrashPoints().reach(point), RangeError, point);
  }
  assert.throws(() => new CrashPoints({ point: 'CP1', occurrence: 0, action: 'throw' }), RangeError);
  assert.throws(() => crashEnvironment('CP1', 1.5), RangeError);
});

test('the crash environment round-trips through the variable', () => {
  assert.deepEqual(crashEnvironment('CP8'), { [CRASH_POINT_VARIABLE]: 'CP8' });
  assert.deepEqual(crashEnvironment('W1.after', 2), { [CRASH_POINT_VARIABLE]: 'W1.after@2' });
  assert.deepEqual(crashPointsFromEnvironment({}).reached, []);
  assert.deepEqual(crashPointsFromEnvironment({ [CRASH_POINT_VARIABLE]: '' }).reached, []);
  for (const text of ['W1.after@0', 'W1.after@x', '@2']) {
    assert.throws(() => crashPointsFromEnvironment({ [CRASH_POINT_VARIABLE]: text }), RangeError, text);
  }
});

test('an armed child process dies by SIGKILL at the armed occurrence', async () => {
  const run = async (env: Record<string, string>) => {
    const child = await ScenarioProcess.start(process.execPath, ['--experimental-strip-types', JOURNAL_WRITER], { env: { ...uncoveredEnvironment(), [CRASH_POINT_VARIABLE]: '', ...env } });
    return { exit: await child.exited, stdout: child.stdout };
  };
  assert.deepEqual(await run({}), {
    exit: { code: 0, signal: null }, stdout: 'W1.before\nW1.after\nW1.before\nW1.after\nW2.before\n',
  });
  assert.deepEqual(await run(crashEnvironment('W1.after', 2)), {
    exit: { code: null, signal: 'SIGKILL' }, stdout: 'W1.before\nW1.after\nW1.before\n',
  });
});

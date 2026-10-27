import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { COVERAGE_VARIABLE, uncoveredEnvironment, withholdCoverageFromDescendants } from '@taskelith/testing';

const PRINT_COVERAGE = ['-e', `console.log(process.env.${COVERAGE_VARIABLE} ?? 'none')`];

test('an uncovered environment keeps every variable but the coverage directory', () => {
  const base = { [COVERAGE_VARIABLE]: '/tmp/node-coverage-1', PATH: '/bin', TASKELITH_SEED: '7' };

  assert.deepEqual(uncoveredEnvironment(base), { PATH: '/bin', TASKELITH_SEED: '7' });
  assert.equal(base[COVERAGE_VARIABLE], '/tmp/node-coverage-1');
  assert.deepEqual(uncoveredEnvironment({ PATH: '/bin' }), { PATH: '/bin' });
});

test('an uncovered environment derives from this process by default', () => {
  const env = uncoveredEnvironment();

  assert.equal(COVERAGE_VARIABLE in env, false);
  assert.equal(env.PATH, process.env.PATH);
  assert.equal(execFileSync(process.execPath, PRINT_COVERAGE, { env, encoding: 'utf8' }).trim(), 'none');
});

test('a process that withholds coverage starts children without it', (t) => {
  const original = process.env[COVERAGE_VARIABLE];
  t.after(() => {
    if (original !== undefined) process.env[COVERAGE_VARIABLE] = original;
  });
  process.env[COVERAGE_VARIABLE] = '/tmp/node-coverage-2';

  withholdCoverageFromDescendants();

  assert.equal(process.env[COVERAGE_VARIABLE], undefined);
  assert.equal(execFileSync(process.execPath, PRINT_COVERAGE, { encoding: 'utf8' }).trim(), 'none');
});

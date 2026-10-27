import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { COVERAGE_VARIABLE, uncoveredEnvironment, withholdCoverageFromDescendants } from '@taskelith/testing';

const PRINT_COVERAGE = ['-e', `console.log(process.env.${COVERAGE_VARIABLE} ?? 'none')`];

function childCoverage(env?: NodeJS.ProcessEnv): string {
  return execFileSync(process.execPath, PRINT_COVERAGE, { env, encoding: 'utf8' }).trim();
}

test('an uncovered environment keeps every variable, from process.env by default, and clears the coverage directory', () => {
  const base = { [COVERAGE_VARIABLE]: '/tmp/node-coverage-1', PATH: '/bin', TASKELITH_SEED: '7' };

  assert.deepEqual(uncoveredEnvironment(base), { [COVERAGE_VARIABLE]: undefined, PATH: '/bin', TASKELITH_SEED: '7' });
  assert.equal(base[COVERAGE_VARIABLE], '/tmp/node-coverage-1');
  assert.equal(uncoveredEnvironment().PATH, process.env.PATH);
});

test('a child started with an uncovered environment writes no coverage file, and a covered one does', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'taskelith-coverage-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const covered = { ...process.env, [COVERAGE_VARIABLE]: directory };

  childCoverage(uncoveredEnvironment(covered));
  assert.deepEqual(readdirSync(directory), []);
  childCoverage(covered);
  assert.equal(readdirSync(directory).length, 1);
});

test('spawn adds the coverage directory back to an env without the key, but not to an uncovered one', (t) => {
  const original = process.env[COVERAGE_VARIABLE];
  const directory = mkdtempSync(join(tmpdir(), 'taskelith-coverage-'));
  t.after(() => {
    if (original === undefined) delete process.env[COVERAGE_VARIABLE];
    else process.env[COVERAGE_VARIABLE] = original;
    rmSync(directory, { recursive: true, force: true });
  });
  process.env[COVERAGE_VARIABLE] = directory;
  const { [COVERAGE_VARIABLE]: _omitted, ...withoutKey } = process.env;

  assert.equal(childCoverage(withoutKey), directory);
  assert.equal(childCoverage(uncoveredEnvironment()), 'none');
});

test('a process that withholds coverage starts children without it', (t) => {
  const original = process.env[COVERAGE_VARIABLE];
  t.after(() => {
    if (original !== undefined) process.env[COVERAGE_VARIABLE] = original;
  });
  process.env[COVERAGE_VARIABLE] = '/nonexistent/node-coverage';

  withholdCoverageFromDescendants();

  assert.equal(process.env[COVERAGE_VARIABLE], undefined);
  assert.equal(childCoverage(), 'none');
});

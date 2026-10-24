import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { missingFromCoverage } from '../scripts/check-coverage-scope.ts';

function workspace(sources: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-coverage-scope-'));
  for (const source of sources) {
    mkdirSync(join(root, source, '..'), { recursive: true });
    writeFileSync(join(root, source), 'export {};\n');
  }
  return root;
}

test('reports product modules whose compiled file is absent from the coverage report', () => {
  const root = workspace(['src/cli.ts', 'src/core/plan.ts', 'src/types.d.ts']);
  try {
    const lcov = `SF:${join(root, 'dist/cli.js')}\nend_of_record\n`;
    assert.deepEqual(missingFromCoverage(root, lcov), [join('src', 'core', 'plan.ts')]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('accepts a report that covers every product module', () => {
  const root = workspace(['src/cli.ts', 'src/core/plan.ts']);
  try {
    const lcov = [`SF:${join(root, 'dist/cli.js')}`, 'end_of_record', `SF:${join(root, 'dist/core/plan.js')}`, 'end_of_record'].join('\n');
    assert.deepEqual(missingFromCoverage(root, lcov), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolves relative report paths against the workspace root, not the process directory', () => {
  const root = workspace(['src/cli.ts']);
  try {
    assert.notEqual(process.cwd(), root);
    assert.deepEqual(missingFromCoverage(root, 'SF:dist/cli.js\nend_of_record\n'), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runs as a command from a path that needs URL encoding', () => {
  const root = workspace(['src/cli.ts']);
  try {
    const script = join(root, 'dir with space #1', 'check-coverage-scope.ts');
    mkdirSync(join(script, '..'));
    copyFileSync(fileURLToPath(new URL('../scripts/check-coverage-scope.ts', import.meta.url)), script);
    writeFileSync(join(root, 'lcov.info'), 'end_of_record\n');
    const run = spawnSync(process.execPath, ['--experimental-strip-types', script, 'lcov.info'], { cwd: root, encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /missing from the coverage report: src[\\/]cli\.ts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

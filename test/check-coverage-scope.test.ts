import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { missingFromCoverage } from '../scripts/check-coverage-scope.ts';

function workspace(sources: string[], packages: string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-coverage-scope-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/kernel', 'packages/modules/*'] }));
  for (const packageDir of packages) {
    mkdirSync(join(root, packageDir), { recursive: true });
    writeFileSync(join(root, packageDir, 'package.json'), '{}');
  }
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
    assert.deepEqual(missingFromCoverage(root, lcov), ['src/core/plan.ts']);
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

test('ignores a module whose compiled file declares only types', () => {
  const root = workspace(['src/cli.ts', 'src/ports/clock.ts', 'src/core/plan.ts']);
  try {
    mkdirSync(join(root, 'dist/ports'), { recursive: true });
    writeFileSync(join(root, 'dist/ports/clock.js'), 'export {};\n//# sourceMappingURL=clock.js.map\n');
    mkdirSync(join(root, 'dist/core'), { recursive: true });
    writeFileSync(join(root, 'dist/core/plan.js'), 'export const plan = 1;\n');
    const lcov = `SF:${join(root, 'dist/cli.js')}\nend_of_record\n`;
    assert.deepEqual(missingFromCoverage(root, lcov), ['src/core/plan.ts']);
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
    symlinkSync(fileURLToPath(new URL('../node_modules', import.meta.url)), join(root, 'node_modules'), 'dir');
    for (const name of ['check-coverage-scope.ts', 'workspace-packages.ts']) {
      copyFileSync(fileURLToPath(new URL(`../scripts/${name}`, import.meta.url)), join(script, '..', name));
    }
    writeFileSync(join(root, 'lcov.info'), 'end_of_record\n');
    const run = spawnSync(process.execPath, ['--experimental-strip-types', script, 'lcov.info'], { cwd: root, encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /missing from the coverage report: src[\\/]cli\.ts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('includes every workspace package and ignores directories that are not packages', () => {
  const sources = ['packages/kernel/src/id.ts', 'packages/modules/sdlc/src/domain/stage.ts', 'packages/modules/draft/src/notes.ts'];
  const root = workspace(sources, ['packages/kernel', 'packages/modules/sdlc']);
  try {
    const lcov = 'SF:packages/kernel/dist/id.js\nend_of_record\n';
    assert.deepEqual(missingFromCoverage(root, lcov), ['packages/modules/sdlc/src/domain/stage.ts']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function browserWorkspace(sources: Record<string, string>, report?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-coverage-scope-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ workspaces: ['apps/*'] }));
  mkdirSync(join(root, 'apps/web/src/generated'), { recursive: true });
  writeFileSync(join(root, 'apps/web/package.json'), '{}');
  for (const [source, text] of Object.entries(sources)) writeFileSync(join(root, 'apps/web', source), text);
  if (report !== undefined) {
    mkdirSync(join(root, 'apps/web/coverage'));
    writeFileSync(join(root, 'apps/web/coverage/lcov.info'), report);
  }
  return root;
}

const BROWSER_SOURCES = {
  'src/App.tsx': 'export function App() { return <main />; }\n',
  'src/client.ts': 'export const send = () => 1;\n',
  'src/generated/types.ts': 'export interface paths { "/x": unknown }\n',
};

test("reads a browser application's sources from its own Vitest report", () => {
  const root = browserWorkspace(BROWSER_SOURCES, 'SF:src/App.tsx\nend_of_record\nSF:src/client.ts\nend_of_record\n');
  try {
    assert.deepEqual(missingFromCoverage(root, ''), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reports a browser module, .tsx included, that its Vitest report lacks', () => {
  const root = browserWorkspace(BROWSER_SOURCES, 'SF:src/client.ts\nend_of_record\n');
  try {
    assert.deepEqual(missingFromCoverage(root, ''), ['apps/web/src/App.tsx']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reports every browser module with runtime code when the Vitest report is missing', () => {
  const root = browserWorkspace(BROWSER_SOURCES);
  try {
    assert.deepEqual(missingFromCoverage(root, ''), ['apps/web/src/App.tsx', 'apps/web/src/client.ts']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

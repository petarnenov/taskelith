import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  BROWSER_APPLICATIONS, browserApplicationProblems, nodePackageDirs, workspacePackageProblems,
} from '../scripts/workspace-packages.ts';

const BUILD_SCRIPT = fileURLToPath(new URL('../scripts/build-workspaces.ts', import.meta.url));
const STUB_BUILD = "node -e \"require('fs').mkdirSync('dist');require('fs').writeFileSync('dist/index.html','')\"";

function browserFixture(manifest: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-browser-app-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', private: true, workspaces: ['apps/*'] }));
  mkdirSync(join(root, 'apps/web'), { recursive: true });
  writeFileSync(join(root, 'apps/web/package.json'), JSON.stringify({
    name: '@taskelith/web', version: '0.0.0', private: true, type: 'module', scripts: { build: STUB_BUILD }, ...manifest,
  }));
  return root;
}

function build(root: string) {
  return spawnSync(process.execPath, ['--experimental-strip-types', BUILD_SCRIPT], { cwd: root, encoding: 'utf8' });
}

test('the build checks a browser application against its own contract and runs its build script', () => {
  const root = browserFixture({ devDependencies: { vite: '8.3.5' } });
  try {
    const result = build(root);
    assert.equal(result.status, 0, result.stderr);
    assert(existsSync(join(root, 'apps/web/dist/index.html')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the build fails on a browser application with runtime, loose, or workspace dependencies', () => {
  const root = browserFixture({ dependencies: { react: '19.3.1' }, devDependencies: { vite: '^8.3.5', '@taskelith/kernel': '0.0.0' } });
  try {
    const result = build(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /apps\/web: must keep every library in devDependencies, not dependencies/);
    assert.match(result.stderr, /apps\/web: must pin exact versions: vite\n/);
    assert.match(result.stderr, /apps\/web: must depend on no workspace package: @taskelith\/kernel/);
    assert(!existsSync(join(root, 'apps/web/dist')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the build fails when a browser application leaves no dist/index.html', () => {
  const root = browserFixture({ scripts: { build: 'node -e ""' } });
  try {
    const result = build(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /build outputs missing: apps\/web\/dist\/index\.html/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the browser application contract names manifest and entry problems', () => {
  const root = browserFixture({ name: '@taskelith/other', private: false, type: 'commonjs', exports: './dist/index.js', main: 'x.js' });
  try {
    assert.deepEqual(browserApplicationProblems(root, 'apps/web'), [
      'name must be @taskelith/web', 'must be private', 'type must be module', 'must declare no exports, main',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('apps/web follows the browser application contract, not the package contract', () => {
  assert.deepEqual([...BROWSER_APPLICATIONS], ['apps/web']);
  assert.deepEqual(browserApplicationProblems(process.cwd(), 'apps/web'), []);
  assert.notDeepEqual(workspacePackageProblems(process.cwd(), 'apps/web'), []);
  assert(!nodePackageDirs(process.cwd()).includes('apps/web'));
});

function nodeTestPatterns(): string[] {
  const script: string = JSON.parse(readFileSync('package.json', 'utf8')).scripts.test;
  return [...script.matchAll(/'([^']+\.test\.ts)'/g)].map((match) => match[1]!);
}

test("Node's test runner runs every package's tests and none of a browser application", () => {
  const matched = new Set(nodeTestPatterns().flatMap((pattern) => globSync(pattern)));
  const browserTests = [...BROWSER_APPLICATIONS].flatMap((dir) => globSync(`${dir}/test/**/*.test.{ts,tsx}`));
  assert(browserTests.length > 0, 'the browser application has tests');
  assert.deepEqual(browserTests.filter((file) => matched.has(file)), []);
  for (const dir of nodePackageDirs(process.cwd())) {
    assert.deepEqual(globSync(`${dir}/test/*.test.ts`).filter((file) => !matched.has(file)), [], dir);
  }
});

test('the root typecheck under NodeNext leaves out the browser application', () => {
  const parsed = ts.getParsedCommandLineOfConfigFile('tsconfig.check.json', {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
  const files = (parsed?.fileNames ?? []).map((file) => file.slice(process.cwd().length + 1));
  assert(files.some((file) => file.startsWith('apps/control-plane/src/')));
  assert.deepEqual(files.filter((file) => file.startsWith('apps/web/')), []);
});

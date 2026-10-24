import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { missingBuildOutputs, workspacePackageDirs, workspacePackageProblems } from '../scripts/workspace-packages.ts';

test('lists existing workspace packages from directory and single-level patterns', () => {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-workspaces-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      workspaces: ['packages/kernel', 'packages/plugin-sdk', 'packages/modules/*', 'packages/plugins/*'],
    }));
    for (const dir of ['packages/kernel', 'packages/modules/sdlc', 'packages/modules/execution']) {
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, 'package.json'), '{}');
    }
    mkdirSync(join(root, 'packages/modules/notes'), { recursive: true });
    writeFileSync(join(root, 'packages/modules/README.md'), '');

    assert.deepEqual(workspacePackageDirs(root), ['packages/kernel', 'packages/modules/execution', 'packages/modules/sdlc']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an empty or absent workspace list has no packages', () => {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-workspaces-'));
  try {
    assert.deepEqual(workspacePackageDirs(root), []);
    writeFileSync(join(root, 'package.json'), '{}');
    assert.deepEqual(workspacePackageDirs(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function contractWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-workspace-contract-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/kernel', 'packages/modules/*'] }));
  const packages: Record<string, { manifest: object; tsconfig: object }> = {
    'packages/kernel': {
      manifest: { name: '@taskelith/kernel', private: true, type: 'module', exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } } },
      tsconfig: { extends: '../../tsconfig.package.json', compilerOptions: { types: [] } },
    },
    'packages/modules/sdlc': {
      manifest: { name: '@taskelith/sdlc', private: true, type: 'module', exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } }, dependencies: { '@taskelith/kernel': '0.0.0' } },
      tsconfig: { extends: '../../../tsconfig.package.json', references: [{ path: '../../kernel' }] },
    },
  };
  for (const [dir, { manifest, tsconfig }] of Object.entries(packages)) {
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, 'package.json'), JSON.stringify(manifest));
    writeFileSync(join(root, dir, 'tsconfig.json'), JSON.stringify(tsconfig));
  }
  return root;
}

test('packages that follow the contract have no problems', () => {
  const root = contractWorkspace();
  try {
    assert.deepEqual(workspacePackageProblems(root, 'packages/kernel'), []);
    assert.deepEqual(workspacePackageProblems(root, 'packages/modules/sdlc'), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the contract reports manifest, export, base, and reference problems', () => {
  const root = contractWorkspace();
  try {
    writeFileSync(join(root, 'packages/modules/sdlc/package.json'), JSON.stringify({
      name: 'sdlc', type: 'commonjs', exports: { '.': './dist/index.js', './testing': './dist/testing.js' }, dependencies: { '@taskelith/kernel': '0.0.0', '@taskelith/missing': '0.0.0' },
    }));
    writeFileSync(join(root, 'packages/modules/sdlc/tsconfig.json'), JSON.stringify({ extends: '../../../tsconfig.json', compilerOptions: { outDir: 'out' } }));
    assert.deepEqual(workspacePackageProblems(root, 'packages/modules/sdlc'), [
      'name must be @taskelith/sdlc',
      'must be private',
      'type must be module',
      'exports must be only the root entry ./dist/index.js with types ./dist/index.d.ts, and for a module also its port entry ./dist/port.js',
      'tsconfig.json must extend ../../../tsconfig.package.json',
      'tsconfig.json must take its layout from the shared package base, not override outDir',
      'depends on @taskelith/missing, which is not a workspace package',
      'tsconfig.json references must be exactly its workspace dependencies: ["../../kernel"]',
    ]);
    rmSync(join(root, 'packages/kernel/tsconfig.json'));
    assert.deepEqual(workspacePackageProblems(root, 'packages/kernel'), ['tsconfig.json is missing']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('only a module package may also export its port entry', () => {
  const root = contractWorkspace();
  const exports = {
    '.': { types: './dist/index.d.ts', default: './dist/index.js' },
    './port': { types: './dist/port.d.ts', default: './dist/port.js' },
  };
  try {
    writeFileSync(join(root, 'packages/modules/sdlc/package.json'), JSON.stringify({
      name: '@taskelith/sdlc', private: true, type: 'module', exports, dependencies: { '@taskelith/kernel': '0.0.0' },
    }));
    writeFileSync(join(root, 'packages/kernel/package.json'), JSON.stringify({ name: '@taskelith/kernel', private: true, type: 'module', exports }));

    assert.deepEqual(workspacePackageProblems(root, 'packages/modules/sdlc'), []);
    assert.deepEqual(workspacePackageProblems(root, 'packages/kernel'), [
      'exports must be only the root entry ./dist/index.js with types ./dist/index.d.ts, and for a module also its port entry ./dist/port.js',
    ]);
    assert.deepEqual(missingBuildOutputs(root, 'packages/modules/sdlc'), ['dist/index.js', 'dist/index.d.ts', 'dist/port.js', 'dist/port.d.ts']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('missing build outputs are reported per package', () => {
  const root = contractWorkspace();
  try {
    mkdirSync(join(root, 'packages/kernel/dist'));
    writeFileSync(join(root, 'packages/kernel/dist/index.js'), '');
    assert.deepEqual(missingBuildOutputs(root, 'packages/kernel'), ['dist/index.d.ts']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the contract dedupes workspace dependencies across manifest sections, includes optional ones, and reads tsconfig comments', () => {
  const root = contractWorkspace();
  try {
    writeFileSync(join(root, 'packages/modules/sdlc/package.json'), JSON.stringify({
      name: '@taskelith/sdlc', private: true, type: 'module', exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      peerDependencies: { '@taskelith/kernel': '0.0.0' }, devDependencies: { '@taskelith/kernel': '0.0.0' }, optionalDependencies: { '@taskelith/kernel': '0.0.0' },
    }));
    writeFileSync(join(root, 'packages/modules/sdlc/tsconfig.json'), '{\n  // shared layout\n  "extends": "../../../tsconfig.package.json",\n  "references": [{ "path": "../../kernel" },],\n}\n');
    assert.deepEqual(workspacePackageProblems(root, 'packages/modules/sdlc'), []);

    writeFileSync(join(root, 'packages/modules/sdlc/tsconfig.json'), '{ "extends": "../../../tsconfig.package.json" }');
    assert.deepEqual(workspacePackageProblems(root, 'packages/modules/sdlc'), ['tsconfig.json references must be exactly its workspace dependencies: ["../../kernel"]']);

    writeFileSync(join(root, 'packages/kernel/package.json'), JSON.stringify({
      name: '@taskelith/kernel', private: true, type: 'module', exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } }, imports: { '#sdlc': '@taskelith/sdlc' },
    }));
    assert.deepEqual(workspacePackageProblems(root, 'packages/kernel'), ['must not declare imports aliases']);

    writeFileSync(join(root, 'packages/kernel/tsconfig.json'), '{ "extends": ');
    assert.throws(() => workspacePackageProblems(root, 'packages/kernel'), /packages\/kernel\/tsconfig\.json/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

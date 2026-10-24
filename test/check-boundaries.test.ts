import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkWorkspaceBoundaries } from '../scripts/check-boundaries.ts';

test('current repository passes workspace boundary checks', () => {
  assert.deepEqual(checkWorkspaceBoundaries(process.cwd()), []);
});

test('boundary checker rejects Go artifacts, SDK imports in domain/application, cross-module internals, and SPA backend imports', () => {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-boundaries-'));
  try {
    mkdirSync(join(root, 'packages/modules/sdlc/domain'), { recursive: true });
    mkdirSync(join(root, 'packages/modules/sdlc/application'), { recursive: true });
    mkdirSync(join(root, 'packages/modules/execution/domain'), { recursive: true });
    mkdirSync(join(root, 'packages/modules/scheduling'), { recursive: true });
    mkdirSync(join(root, 'packages/adapters/postgres'), { recursive: true });
    mkdirSync(join(root, 'apps/web/src'), { recursive: true });
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'scripts'), { recursive: true });

    writeFileSync(join(root, 'packages/modules/execution/index.ts'), 'export const ok = 1;\n');
    writeFileSync(join(root, 'packages/modules/execution/domain/internal.ts'), 'export const secret = 2;\n');
    writeFileSync(join(root, 'packages/adapters/postgres/client.ts'), 'export const pg = {};\n');
    writeFileSync(join(root, 'scripts/helper.ts'), 'export const dev = true;\n');

    // Valid module imports including NodeNext .js extension to public index
    writeFileSync(
      join(root, 'packages/modules/sdlc/application/use-case.ts'),
      "import { ok } from '../../execution/index.js';\nexport const run = () => ok;\n",
    );
    assert.deepEqual(checkWorkspaceBoundaries(root), []);

    // Violations
    writeFileSync(join(root, 'bridge.go'), 'package main\n');
    writeFileSync(
      join(root, 'packages/modules/sdlc/domain/model.ts'),
      "import pg from 'pg';\nimport { run } from '../application/use-case.ts';\nexport type Pool = import('nats').NatsConnection;\n",
    );
    writeFileSync(
      join(root, 'packages/modules/sdlc/application/bad.ts'),
      "import { pg } from '../../../adapters/postgres/client.ts';\nimport { secret } from '../../execution/domain/internal.ts';\nimport sqlite = require('better-sqlite3');\n",
    );
    writeFileSync(
      join(root, 'packages/modules/scheduling/index.ts'),
      "export { secret } from '../execution/domain/internal.js';\n",
    );
    writeFileSync(
      join(root, 'apps/web/src/view.ts'),
      "import { readFileSync } from 'fs';\nimport { ok } from '../../../packages/modules/execution/index.js';\n",
    );
    writeFileSync(
      join(root, 'src/cli.ts'),
      "import { dev } from '../scripts/helper.ts';\n",
    );

    const violations = checkWorkspaceBoundaries(root);
    assert(violations.some(v => v.includes('bridge.go') && v.includes('R02/R36')));
    assert(violations.some(v => v.includes('domain/model.ts') && v.includes('infrastructure SDK "pg"')));
    assert(violations.some(v => v.includes('domain/model.ts') && v.includes('infrastructure SDK "nats"')));
    assert(violations.some(v => v.includes('domain/model.ts') && v.includes('cannot import packages/modules/sdlc/application/use-case.ts')));
    assert(violations.some(v => v.includes('application/bad.ts') && v.includes('cannot import adapter')));
    assert(violations.some(v => v.includes('application/bad.ts') && v.includes('cross-module import into "execution"')));
    assert(violations.some(v => v.includes('application/bad.ts') && v.includes('infrastructure SDK "better-sqlite3"')));
    assert(violations.some(v => v.includes('scheduling/index.ts') && v.includes('cross-module import into "execution"')));
    assert(violations.some(v => v.includes('apps/web/src/view.ts') && v.includes('"fs"')));
    assert(violations.some(v => v.includes('apps/web/src/view.ts') && v.includes('backend/worker module')));
    assert(violations.some(v => v.includes('src/cli.ts') && v.includes('cannot import development scripts')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('boundary checker CLI runs when started through a symlinked path', () => {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-boundaries-cli-'));
  try {
    const realDir = join(root, 'real');
    const linkedDir = join(root, 'linked');
    mkdirSync(realDir);
    symlinkSync(realDir, linkedDir, 'dir');
    symlinkSync(fileURLToPath(new URL('../scripts/check-boundaries.ts', import.meta.url)), join(realDir, 'check-boundaries.ts'));
    const workspace = join(root, 'workspace');
    mkdirSync(workspace);
    writeFileSync(join(workspace, 'bridge.go'), 'package main\n');

    const run = spawnSync(
      process.execPath,
      ['--experimental-strip-types', join(linkedDir, 'check-boundaries.ts')],
      { cwd: workspace, encoding: 'utf8' },
    );

    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /Boundary violation: bridge\.go: .*R02\/R36/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

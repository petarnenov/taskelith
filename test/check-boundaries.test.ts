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

    writeFileSync(join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/modules/*', 'packages/adapters/*'] }));
    writeFileSync(join(root, 'packages/modules/execution/package.json'), JSON.stringify({ name: '@taskelith/execution' }));
    writeFileSync(join(root, 'packages/modules/execution/index.ts'), 'export const ok = 1;\n');
    writeFileSync(join(root, 'packages/modules/execution/domain/internal.ts'), 'export const secret = 2;\n');
    writeFileSync(join(root, 'packages/adapters/postgres/client.ts'), 'export const pg = {};\n');
    writeFileSync(join(root, 'scripts/helper.ts'), 'export const dev = true;\n');

    // A valid cross-module import goes through the other package's name
    writeFileSync(
      join(root, 'packages/modules/sdlc/application/use-case.ts'),
      "import { ok } from '@taskelith/execution';\nexport const run = () => ok;\n",
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

test('boundary checker applies layer rules inside package src/ and limits kernel and plugin imports', () => {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-boundaries-packages-'));
  try {
    for (const dir of ['packages/kernel/src', 'packages/modules/sdlc/src/domain', 'packages/modules/sdlc/src/application', 'packages/plugins/sdlc-openspec/src']) {
      mkdirSync(join(root, dir), { recursive: true });
    }
    writeFileSync(join(root, 'packages/kernel/src/index.ts'), "import { createHash } from 'node:crypto';\nexport const id = createHash;\n");
    writeFileSync(join(root, 'packages/modules/sdlc/src/application/service.ts'), "import { id } from '@taskelith/kernel';\nexport const run = id;\n");
    writeFileSync(
      join(root, 'packages/plugins/sdlc-openspec/src/index.ts'),
      "import { id } from '@taskelith/kernel';\nimport type { Port } from '@taskelith/plugin-sdk';\nimport { helper } from './helper.js';\nexport const plugin = { id, helper } as unknown as Port;\n",
    );
    assert.deepEqual(checkWorkspaceBoundaries(root), []);

    writeFileSync(join(root, 'packages/modules/sdlc/src/domain/stage.ts'), "import { run } from '../application/service.ts';\nexport const stage = run;\n");
    writeFileSync(
      join(root, 'packages/kernel/src/bad.ts'),
      "import { run } from '@taskelith/sdlc';\nimport { stage } from '../../modules/sdlc/src/domain/stage.ts';\nimport pg from 'pg';\n",
    );
    writeFileSync(
      join(root, 'packages/plugins/sdlc-openspec/src/bad.ts'),
      "import { run } from '@taskelith/sdlc';\nimport { stage } from '../../../modules/sdlc/src/domain/stage.ts';\nimport { id } from '@taskelith/kernel/src/index.ts';\n",
    );

    const violations = checkWorkspaceBoundaries(root);
    assert(violations.some(v => v.includes('domain/stage.ts') && v.includes('cannot import packages/modules/sdlc/src/application/service.ts')));
    assert(violations.some(v => v.includes('kernel/src/bad.ts') && v.includes('kernel cannot import workspace package "@taskelith/sdlc"')));
    assert(violations.some(v => v.includes('kernel/src/bad.ts') && v.includes('kernel cannot import outside packages/kernel')));
    assert(violations.some(v => v.includes('kernel/src/bad.ts') && v.includes('infrastructure SDK "pg"')));
    assert(violations.some(v => v.includes('sdlc-openspec/src/bad.ts') && v.includes('may import only the kernel, plugin SDK, and contracts packages, not "@taskelith/sdlc"')));
    assert(violations.some(v => v.includes('sdlc-openspec/src/bad.ts') && v.includes('crosses into another package')));
    assert(violations.some(v => v.includes('kernel/src/bad.ts') && v.includes('crosses into another package')));
    assert(violations.some(v => v.includes('sdlc-openspec/src/bad.ts') && v.includes('must be imported through its root export')));
    assert.equal(violations.length, 8, violations.join('\n'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('boundary checker resolves workspace package names and guards package encapsulation and development code', () => {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-boundaries-names-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/kernel', 'packages/modules/*', 'packages/adapters/*'] }));
    const packages = { 'packages/kernel': '@taskelith/kernel', 'packages/modules/sdlc': '@taskelith/sdlc', 'packages/modules/execution': '@taskelith/execution', 'packages/adapters/postgres': '@taskelith/postgres' };
    for (const [dir, name] of Object.entries(packages)) {
      mkdirSync(join(root, dir, 'src'), { recursive: true });
      mkdirSync(join(root, dir, 'test'), { recursive: true });
      writeFileSync(join(root, dir, 'package.json'), JSON.stringify({ name }));
    }
    mkdirSync(join(root, 'packages/modules/sdlc/src/domain'), { recursive: true });
    mkdirSync(join(root, 'packages/modules/sdlc/src/application'), { recursive: true });
    mkdirSync(join(root, 'apps/web/src'), { recursive: true });
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'packages/modules/sdlc/test/integration.test.ts'), "import pg from 'pg';\nimport { db } from '@taskelith/postgres';\n");
    assert.deepEqual(checkWorkspaceBoundaries(root), []);

    writeFileSync(join(root, 'packages/modules/sdlc/src/application/store.ts'), "import { db } from '@taskelith/postgres';\nimport { fixture } from '../../test/fixture.ts';\nimport { secret } from '../../../execution/src/internal.ts';\n");
    writeFileSync(join(root, 'packages/modules/sdlc/src/domain/stage.ts'), "import service = require('../application');\n");
    writeFileSync(join(root, 'packages/kernel/src/index.ts'), "import { helper } from '../../../scripts/helper.ts';\n");
    writeFileSync(join(root, 'apps/web/src/view.ts'), "import { run } from '@taskelith/sdlc';\n");
    writeFileSync(join(root, 'src/cli.ts'), "import { id } from '@taskelith/kernel';\nimport { secret } from '../packages/kernel/src/index.ts';\nimport { alias } from '#kernel';\n");
    writeFileSync(join(root, 'packages/modules/sdlc/src/domain/rules.ts'), "import { a } from '../application.js';\nimport { p } from '../ports.ts';\n");
    writeFileSync(join(root, 'packages/modules/sdlc/src/domain.ts'), "import { a } from './application.js';\n");
    writeFileSync(join(root, 'packages/kernel/src/dynamic.ts'), "const a = import('@taskelith/sdlc', {});\nconst b = import(`@taskelith/execution`);\nconst c = require(`@taskelith/postgres`);\n");
    writeFileSync(join(root, 'apps/web/src/installed.ts'), "import { x } from '../../../node_modules/@taskelith/sdlc/dist/index.js';\n");
    writeFileSync(join(root, 'packages/modules/execution/src/compiled.ts'), "import { y } from '../../sdlc/dist/application/service.js';\nimport { z } from './../dist/index.js';\n");

    const violations = checkWorkspaceBoundaries(root);
    const expected = [
      ['application/store.ts', 'cannot import adapter, plugin, or app "@taskelith/postgres"'],
      ['application/store.ts', 'product source cannot import development scripts or tests (../../test/fixture.ts)'],
      ['application/store.ts', 'relative import "../../../execution/src/internal.ts" crosses into another package'],
      ['application/store.ts', 'cross-module import into "execution"'],
      ['domain/stage.ts', 'cannot import packages/modules/sdlc/src/application'],
      ['kernel/src/index.ts', 'product source cannot import development scripts or tests'],
      ['kernel/src/index.ts', 'kernel cannot import outside packages/kernel'],
      ['apps/web/src/view.ts', 'cannot import backend/worker module or adapter "@taskelith/sdlc"'],
      ['src/cli.ts', 'published root package cannot import private workspace package "@taskelith/kernel"'],
      ['src/cli.ts', 'relative import "../packages/kernel/src/index.ts" crosses into another package'],
      ['src/cli.ts', 'package imports alias "#kernel"'],
      ['domain/rules.ts', 'cannot import packages/modules/sdlc/src/application.js'],
      ['domain/rules.ts', 'cannot import packages/modules/sdlc/src/ports.ts'],
      ['sdlc/src/domain.ts', 'domain layer in module "sdlc" cannot import packages/modules/sdlc/src/application.js'],
      ['kernel/src/dynamic.ts', 'kernel cannot import workspace package "@taskelith/sdlc"'],
      ['kernel/src/dynamic.ts', 'kernel cannot import workspace package "@taskelith/execution"'],
      ['kernel/src/dynamic.ts', 'kernel cannot import workspace package "@taskelith/postgres"'],
      ['apps/web/src/installed.ts', 'reaches installed or built code'],
      ['execution/src/compiled.ts', 'relative import "../../sdlc/dist/application/service.js" reaches installed or built code'],
      ['execution/src/compiled.ts', 'relative import "../../sdlc/dist/application/service.js" crosses into another package'],
      ['execution/src/compiled.ts', 'cross-module import into "sdlc"'],
      ['execution/src/compiled.ts', 'relative import "./../dist/index.js" reaches installed or built code'],
    ];
    for (const [file, message] of expected) {
      assert(violations.some(v => v.includes(file!) && v.includes(message!)), `${file}: ${message}\n${violations.join('\n')}`);
    }
    assert.equal(violations.length, expected.length, violations.join('\n'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the plugin SDK reads a module only type-only through its port entry', () => {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-boundaries-sdk-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/kernel', 'packages/plugin-sdk', 'packages/modules/*'] }));
    const packages = { 'packages/kernel': '@taskelith/kernel', 'packages/plugin-sdk': '@taskelith/plugin-sdk', 'packages/modules/sdlc': '@taskelith/sdlc' };
    for (const [dir, name] of Object.entries(packages)) {
      mkdirSync(join(root, dir, 'src'), { recursive: true });
      writeFileSync(join(root, dir, 'package.json'), JSON.stringify({ name }));
    }
    writeFileSync(
      join(root, 'packages/plugin-sdk/src/index.ts'),
      "import { ok } from '@taskelith/kernel';\nimport type { Port } from '@taskelith/sdlc/port';\nexport type { Port as SdkPort } from '@taskelith/sdlc/port';\nexport type Other = import('@taskelith/sdlc/port').Port;\nexport const run = ok;\n",
    );
    writeFileSync(join(root, 'packages/modules/sdlc/src/application.ts'), "import type { Port } from '@taskelith/sdlc/port';\nexport type P = Port;\n");
    assert.deepEqual(checkWorkspaceBoundaries(root), []);

    mkdirSync(join(root, 'packages/modules/sdlc/src/domain'));
    writeFileSync(join(root, 'packages/modules/sdlc/src/domain/rule.ts'), "import { VERSION } from '@taskelith/sdlc/port';\nimport { p } from '../port.ts';\n");
    const domainViolations = checkWorkspaceBoundaries(root);
    assert.deepEqual(domainViolations.length, 2, domainViolations.join('\n'));
    assert(domainViolations.every(v => v.includes('domain/rule.ts') && v.includes('cannot import packages/modules/sdlc/src/port.ts')));
    rmSync(join(root, 'packages/modules/sdlc/src/domain'), { recursive: true });

    writeFileSync(
      join(root, 'packages/plugin-sdk/src/bad.ts'),
      [
        "import { VERSION } from '@taskelith/sdlc/port';",
        "import { type Port } from '@taskelith/sdlc/port';",
        "export { VERSION as V } from '@taskelith/sdlc/port';",
        "import type { Stage } from '@taskelith/sdlc';",
        "const later = import('@taskelith/sdlc/port');",
        "import type { Rule } from '@taskelith/sdlc/domain';",
        "import type { Kernel } from '@taskelith/kernel/port';",
      ].join('\n'),
    );

    const violations = checkWorkspaceBoundaries(root);
    const sdkRule = 'the plugin SDK may import module "@taskelith/sdlc" only type-only through its port entry';
    const expected = [
      [sdkRule, '"@taskelith/sdlc/port"'],
      [sdkRule, '"@taskelith/sdlc/port"'],
      [sdkRule, '"@taskelith/sdlc/port"'],
      [sdkRule, '"@taskelith/sdlc"'],
      [sdkRule, '"@taskelith/sdlc/port"'],
      [sdkRule, '"@taskelith/sdlc/domain"'],
      ['workspace package "@taskelith/sdlc" must be imported through its root export or port entry', '"@taskelith/sdlc/domain"'],
      ['workspace package "@taskelith/kernel" must be imported through its root export or port entry', '"@taskelith/kernel/port"'],
    ];
    for (const [message, spec] of expected) {
      assert(violations.some(v => v.includes('plugin-sdk/src/bad.ts') && v.includes(message!) && v.includes(spec!)), `${message} ${spec}\n${violations.join('\n')}`);
    }
    assert.equal(violations.length, expected.length, violations.join('\n'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

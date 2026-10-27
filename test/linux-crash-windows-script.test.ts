import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// scripts/linux-crash-windows.sh with a docker stub that prints its options.

function dockerOptions(environment: NodeJS.ProcessEnv): string {
  const directory = mkdtempSync(join(tmpdir(), 'taskelith-crash-windows-'));
  try {
    const docker = join(directory, 'docker');
    writeFileSync(docker, '#!/usr/bin/env bash\nprintf "%s\\n" "$@"\n');
    chmodSync(docker, 0o755);
    const run = spawnSync('bash', ['scripts/linux-crash-windows.sh', 'image'], {
      encoding: 'utf8',
      timeout: 20_000,
      env: { ...process.env, TASKELITH_SERVICES_SECRETS: directory, PATH: `${directory}:${process.env.PATH ?? ''}`, ...environment },
    });
    assert.equal(run.status, 0, run.stderr);
    return run.stdout;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('a native acceptance proof passes its context into the container', () => {
  const options = dockerOptions({ TASKELITH_ACCEPTANCE: '{"row":"connectivity"}' });
  assert.match(options, /^--env\nTASKELITH_ACCEPTANCE$/m);
});

test('a run outside native acceptance passes no acceptance context', () => {
  const options = dockerOptions({ TASKELITH_ACCEPTANCE: '' });
  assert.doesNotMatch(options, /TASKELITH_ACCEPTANCE/);
});

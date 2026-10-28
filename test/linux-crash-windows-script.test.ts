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

test('the partition scenarios reach Toxiproxy and the proxied services', () => {
  const options = dockerOptions({});
  for (const variable of ['TASKELITH_TOXIPROXY_URL', 'TASKELITH_POSTGRES_PROXY_URL', 'TASKELITH_NATS_PROXY_URL']) {
    assert.match(options, new RegExp(`^--env\\n${variable}$`, 'm'));
  }
});

// The node:test arguments of tools/linux-cgroup/crash-windows.sh.
function testArguments(...args: string[]): string[] {
  const run = spawnSync('bash', ['-c', 'source tools/linux-cgroup/crash-windows.sh; test_arguments "$@"', 'bash', ...args], { encoding: 'utf8', timeout: 20_000 });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.split('\n').filter((line) => line !== '');
}

const CRASH_WINDOWS = 'apps/control-plane/test/crash-windows.integration.test.ts';
const RACES = 'test/g2-cancellation-races.test.ts';

test('a pattern with its value attached keeps the crash windows by default', () => {
  assert.deepEqual(testArguments('--test-name-pattern=redelivered'), ['--test-name-pattern=redelivered', CRASH_WINDOWS]);
});

test('a pattern with its value apart is never taken for a test file', () => {
  assert.deepEqual(testArguments('--test-name-pattern', 'redelivered'), ['--test-name-pattern', 'redelivered', CRASH_WINDOWS]);
});

test('files after the separator replace the crash windows, whatever the pattern form', () => {
  assert.deepEqual(testArguments('--test-name-pattern=a b', '--', RACES), ['--test-name-pattern=a b', RACES]);
  assert.deepEqual(testArguments('--test-name-pattern', 'a', '--', RACES, CRASH_WINDOWS), ['--test-name-pattern', 'a', RACES, CRASH_WINDOWS]);
});

test('no arguments, or a separator without files, run the crash windows', () => {
  assert.deepEqual(testArguments(), [CRASH_WINDOWS]);
  assert.deepEqual(testArguments('--'), [CRASH_WINDOWS]);
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const script = resolve('scripts/web-dev.sh');

// The fake docker records each call and fails, so no installation is reached.
const fakeDocker = `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_DOCKER_CALLS"
exit 1
`;

interface Outcome {
  readonly status: number | null;
  readonly stderr: string;
  readonly dockerCalls: string;
}

function runWebDev(args: readonly string[], opensslVersion: string): Outcome {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-web-dev-test-'));
  try {
    writeExecutable(join(root, 'docker'), fakeDocker);
    writeExecutable(join(root, 'openssl'), `#!/bin/sh\necho '${opensslVersion}'\n`);
    const calls = join(root, 'calls');
    writeFileSync(calls, '');
    const run = spawnSync('bash', [script, ...args], {
      encoding: 'utf8',
      env: { PATH: [root, '/usr/bin', '/bin'].join(':'), FAKE_DOCKER_CALLS: calls },
    });
    return { status: run.status, stderr: run.stderr, dockerCalls: readFileSync(calls, 'utf8') };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeExecutable(path: string, content: string): void {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}

test('web-dev.sh without a project prints its usage', () => {
  const outcome = runWebDev([], 'OpenSSL 3.0.13 30 Jan 2024');
  assert.notEqual(outcome.status, 0);
  assert.match(outcome.stderr, /usage: web-dev\.sh PROJECT/);
  assert.equal(outcome.dockerCalls, '');
});

test('web-dev.sh refuses an OpenSSL older than 3.0 and names the version', () => {
  const outcome = runWebDev(['web-dev-test'], 'LibreSSL 3.3.6');
  assert.equal(outcome.status, 1);
  assert.match(outcome.stderr, /make web-dev needs OpenSSL 3\.0 or later \(found: LibreSSL 3\.3\.6\)/);
  assert.equal(outcome.dockerCalls, '');
});

test('web-dev.sh with OpenSSL 3.0 or later goes on to read the installation CA', () => {
  const outcome = runWebDev(['web-dev-test'], 'OpenSSL 3.0.13 30 Jan 2024');
  assert.notEqual(outcome.status, 0);
  assert.doesNotMatch(outcome.stderr, /needs OpenSSL/);
  assert.match(outcome.dockerCalls, /installation-ca\.pem/);
});

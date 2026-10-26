import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const script = resolve('scripts/installation.sh');

// Records each call; `up` fails, and `logs` prints the prepared log.
const fakeDocker = `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_DOCKER_CALLS"
case " $* " in
  *" up "*) exit 1 ;;
  *" logs "*) cat "$FAKE_LOGS" ;;
esac
exit 0
`;

interface Outcome {
  readonly status: number | null;
  readonly stderr: string;
  readonly calls: readonly string[];
}

function runScript(command: string, log: string): Outcome {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-installation-'));
  try {
    const docker = join(root, 'docker');
    writeFileSync(docker, fakeDocker);
    chmodSync(docker, 0o755);
    writeFileSync(join(root, 'logs'), log);
    const calls = join(root, 'calls');
    writeFileSync(calls, '');
    const run = spawnSync('bash', [script, command, 'installation-script-test'], {
      encoding: 'utf8',
      env: { PATH: [root, '/usr/bin', '/bin'].join(':'), FAKE_DOCKER_CALLS: calls, FAKE_LOGS: join(root, 'logs') },
    });
    return { status: run.status, stderr: run.stderr, calls: readFileSync(calls, 'utf8').trim().split('\n') };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function indexOfCall(calls: readonly string[], fragment: string): number {
  return calls.findIndex((call) => call.includes(fragment));
}

test('a failed start stops the control plane and prints its last error', () => {
  const log = ['{"event":"starting"}', '{"error":{"message":"first"}}', '{"error":{"message":"last"}}', ''].join('\n');
  const outcome = runScript('start', log);
  assert.equal(outcome.status, 1);
  assert.ok(indexOfCall(outcome.calls, 'stop control-plane') > indexOfCall(outcome.calls, 'up --detach'));
  assert.match(outcome.stderr, /^\{"error":\{"message":"last"\}\}$/m);
  assert.doesNotMatch(outcome.stderr, /first|starting/);
  assert.match(outcome.stderr, /the control plane is stopped/);
});

test('a failed start without an error line prints the last 20 log lines', () => {
  const lines = Array.from({ length: 25 }, (_, index) => `line ${index + 1}`);
  const outcome = runScript('start', `${lines.join('\n')}\n`);
  assert.equal(outcome.status, 1);
  assert.match(outcome.stderr, /^line 6$/m);
  assert.match(outcome.stderr, /^line 25$/m);
  assert.doesNotMatch(outcome.stderr, /^line 5$/m);
});

test('a failed check prints the control-plane log before it removes the project', () => {
  const outcome = runScript('verify', '{"error":{"message":"broker"}}\n');
  assert.notEqual(outcome.status, 0);
  assert.match(outcome.stderr, /"broker"/);
  const logs = indexOfCall(outcome.calls, 'logs --no-color control-plane');
  assert.ok(logs >= 0, 'the log was read');
  const removals = outcome.calls.flatMap((call, index) => (call.includes('down --volumes') ? [index] : []));
  assert.ok(logs < (removals[removals.length - 1] ?? -1), 'before the last removal');
});

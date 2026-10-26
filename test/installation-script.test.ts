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

const WORKER_CAPABILITIES = 'CapInh:\t0000000000000000\nCapPrm:\t00000000000000e0\nCapEff:\t00000000000000e0\n'
  + 'CapBnd:\t00000000000000e0\nCapAmb:\t0000000000000000\n';
const REFUSED = 'bash: line 1: /sys/fs/cgroup/init/cgroup.procs: Permission denied';

// `exec --user` prints FAKE_WRITE_OUTPUT and exits with FAKE_WRITE; the
// other `exec` prints FAKE_CAPS.
const containmentDocker = `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_DOCKER_CALLS"
case " $* " in
  *" exec "*"--user 10003:10003"*) echo "$FAKE_WRITE_OUTPUT" >&2; exit "$FAKE_WRITE" ;;
  *" exec "*) printf '%s' "$FAKE_CAPS" ;;
esac
exit 0
`;

function checkContainment(write: number, capabilities: string, writeOutput = REFUSED): Outcome {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-containment-'));
  try {
    writeFileSync(join(root, 'docker'), containmentDocker);
    chmodSync(join(root, 'docker'), 0o755);
    const calls = join(root, 'calls');
    writeFileSync(calls, '');
    const run = spawnSync('bash', [script, 'check-containment', 'installation-script-test'], {
      encoding: 'utf8',
      env: { PATH: [root, '/usr/bin', '/bin'].join(':'), FAKE_DOCKER_CALLS: calls, FAKE_WRITE: String(write), FAKE_CAPS: capabilities,
        FAKE_WRITE_OUTPUT: writeOutput },
    });
    return { status: run.status, stderr: run.stderr, calls: readFileSync(calls, 'utf8').trim().split('\n') };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('the containment check passes when the execution account is refused and the worker has three capabilities', () => {
  const outcome = checkContainment(1, WORKER_CAPABILITIES);
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.ok(outcome.calls.some((call) => call.includes('--user 10003:10003 worker') && call.includes('/sys/fs/cgroup/init/cgroup.procs')));
});

test('the containment check fails when the execution account can write the worker cgroup', () => {
  const outcome = checkContainment(0, WORKER_CAPABILITIES);
  assert.equal(outcome.status, 1);
  assert.match(outcome.stderr, /execution account can write/);
});

test('the containment check fails when the worker process has other capabilities', () => {
  const variants = [
    WORKER_CAPABILITIES.replace('CapAmb:\t0000000000000000', 'CapAmb:\t00000000000000e0'),
    WORKER_CAPABILITIES.replace('CapInh:\t0000000000000000', 'CapInh:\t00000000000000e0'),
    WORKER_CAPABILITIES.replace('CapPrm:\t00000000000000e0', 'CapPrm:\t000001ffffffffff'),
    'CapEff:\t000001ffffffffff\n', '',
  ];
  for (const capabilities of variants) {
    const outcome = checkContainment(1, capabilities);
    assert.equal(outcome.status, 1, JSON.stringify(capabilities));
    assert.match(outcome.stderr, /other capabilities/);
  }
});

test('the containment check fails when the probe fails for another reason than a refusal', () => {
  const outcome = checkContainment(1, WORKER_CAPABILITIES, 'service "worker" is not running');
  assert.equal(outcome.status, 1);
  assert.match(outcome.stderr, /cgroup\.procs probe failed: service "worker" is not running/);
});

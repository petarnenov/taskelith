import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// Answers the image ID of a tag ending in -first or -second; a FAKE_ status
// fails builds or removals, and FAKE_MOVE_HEAD commits during the first build.
const buildDocker = `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_DOCKER_CALLS"
case "$*" in
  "build "*)
    case "$*" in *"-first "*) [ -z "$FAKE_MOVE_HEAD" ] || GIT_COMMITTER_DATE='@1800000000 +0000' \\
      git -C "$FAKE_MOVE_HEAD" -c user.name=test -c user.email=test@example.invalid \\
      commit --quiet --allow-empty --message moved ;; esac
    exit "\${FAKE_BUILD_STATUS:-0}" ;;
  "image inspect --format {{.Id}} "*-first) echo "$FAKE_FIRST_ID" ;;
  "image inspect --format {{.Id}} "*-second) echo "$FAKE_SECOND_ID" ;;
  "image rm "*) exit "\${FAKE_REMOVE_STATUS:-0}" ;;
esac
exit 0
`;

// Fails \`git stash create\` with FAKE_STASH_STATUS and \`git log\` with
// FAKE_LOG_STATUS when they are set.
const stashGit = `#!/bin/sh
if [ -n "$FAKE_STASH_STATUS" ] && [ "$3 $4" = "stash create" ]; then exit "$FAKE_STASH_STATUS"; fi
if [ -n "$FAKE_LOG_STATUS" ] && [ "$3" = "log" ]; then exit "$FAKE_LOG_STATUS"; fi
exec /usr/bin/git "$@"
`;

const COMMIT_TIME = 1700000000;

const PINS = {
  TASKELITH_UBUNTU_BASE: 'ubuntu:24.04@sha256:base', TASKELITH_NODE_VERSION: '24.0.0',
  TASKELITH_NODE_SHA256_AMD64: 'amd64', TASKELITH_NODE_SHA256_ARM64: 'arm64',
};

const FIXTURE_SCRIPTS = ['installation.sh', 'installation-scenarios.sh', 'harness-qualification.sh'];

interface BuildOutcome extends Outcome {
  readonly stdout: string;
}

// Runs a copy of a script in a repository whose one commit has COMMIT_TIME.
function runInFixture(script: string, args: readonly string[], environment: Record<string, string> = {}): BuildOutcome {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-image-build-'));
  try {
    const repository = join(root, 'repository');
    mkdirSync(join(repository, 'scripts'), { recursive: true });
    for (const name of FIXTURE_SCRIPTS) copyFileSync(resolve('scripts', name), join(repository, 'scripts', name));
    const date = `@${COMMIT_TIME} +0000`;
    const git = (...gitArgs: string[]) => spawnSync('git', ['-C', repository, '-c', 'user.name=test', '-c', 'user.email=test@example.invalid', ...gitArgs], {
      encoding: 'utf8', env: { PATH: '/usr/bin:/bin', GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    });
    git('init', '--quiet');
    git('add', '.');
    assert.equal(git('commit', '--quiet', '--message', 'fixture').status, 0);
    const bin = join(root, 'bin');
    mkdirSync(bin);
    for (const [name, source] of [['docker', buildDocker], ['git', stashGit]]) {
      writeFileSync(join(bin, name), source);
      chmodSync(join(bin, name), 0o755);
    }
    const calls = join(root, 'calls');
    writeFileSync(calls, '');
    const run = spawnSync('bash', [join(repository, 'scripts', script), ...args.map((arg) => arg.replace('{root}', root))], {
      encoding: 'utf8',
      env: {
        ...PINS, ...Object.fromEntries(Object.entries(environment).map(([name, value]) => [name, value.replace('{root}', root)])),
        PATH: [bin, '/usr/bin', '/bin'].join(':'), FAKE_DOCKER_CALLS: calls,
      },
    });
    const recorded = readFileSync(calls, 'utf8').trim().split('\n');
    return { status: run.status, stdout: run.stdout, stderr: run.stderr, calls: recorded };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function checkReproducible(firstId: string, secondId: string, environment: Record<string, string> = {}): BuildOutcome {
  return runInFixture('installation.sh', ['check-reproducible', 'installation-script-test'], {
    FAKE_FIRST_ID: firstId, FAKE_SECOND_ID: secondId, ...environment,
  });
}

function builds(calls: readonly string[]): readonly string[] {
  return calls.filter((call) => call.startsWith('build '));
}

const COMMIT_EPOCH_ARGUMENT = ` --build-arg SOURCE_DATE_EPOCH=${COMMIT_TIME} `;

test('the images are built with the commit time of the built revision as SOURCE_DATE_EPOCH', () => {
  const outcome = runInFixture('installation.sh', ['build', 'installation-script-test']);
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.equal(builds(outcome.calls).length, 2);
  for (const call of builds(outcome.calls)) assert.ok(call.includes(COMMIT_EPOCH_ARGUMENT), call);
});

test('the harness variant is built with the commit time of the built tree as SOURCE_DATE_EPOCH', () => {
  const outcome = runInFixture('harness-qualification.sh', ['{root}/out'], { PLATFORMS: 'linux/amd64', FAKE_BUILD_STATUS: '1' });
  assert.equal(outcome.status, 1);
  const [build, ...others] = builds(outcome.calls);
  assert.equal(others.length, 0);
  assert.ok(build?.includes(COMMIT_EPOCH_ARGUMENT), build);
});

test('the reproducibility check builds the worker twice without the cache and passes on one image ID', () => {
  const outcome = checkReproducible('sha256:same', 'sha256:same');
  assert.equal(outcome.status, 0, outcome.stderr);
  const [first, second, ...others] = builds(outcome.calls);
  assert.equal(others.length, 0);
  for (const [call, tag] of [[first, 'first'], [second, 'second']] as const) {
    assert.match(call ?? '', /^build --no-cache .* --target worker --tag taskelith-worker:installation-script-test-/);
    assert.ok(call?.includes(`-${tag} `), call);
    assert.ok(call?.includes(COMMIT_EPOCH_ARGUMENT), call);
  }
  assert.match(outcome.stdout, /both builds gave the worker image sha256:same/);
  assert.ok(outcome.calls.some((call) => /^image rm .*-first .*-second$/.test(call)), 'both images are removed');
});

test('the reproducibility check fails and names both image IDs when they differ', () => {
  const outcome = checkReproducible('sha256:one', 'sha256:two');
  assert.equal(outcome.status, 1);
  assert.match(outcome.stderr, /two builds of one revision gave sha256:one and sha256:two/);
  assert.ok(outcome.calls.some((call) => /^image rm .*-first .*-second$/.test(call)), 'both images are removed');
});

test('a failed stash of the uncommitted edits stops the build before any image is built', () => {
  for (const command of ['build', 'check-reproducible']) {
    const outcome = runInFixture('installation.sh', [command, 'installation-script-test'], { FAKE_STASH_STATUS: '23' });
    assert.notEqual(outcome.status, 0, command);
    assert.equal(builds(outcome.calls).length, 0, command);
  }
});

test('the reproducibility check builds one commit when HEAD moves between its builds', () => {
  const outcome = checkReproducible('sha256:same', 'sha256:same', { FAKE_MOVE_HEAD: '{root}/repository' });
  assert.equal(outcome.status, 0, outcome.stderr);
  const calls = builds(outcome.calls);
  assert.equal(calls.length, 2);
  for (const call of calls) assert.ok(call.includes(COMMIT_EPOCH_ARGUMENT), call);
});

test('a failed removal of the images fails a passing check and reports it', () => {
  const outcome = checkReproducible('sha256:same', 'sha256:same', { FAKE_REMOVE_STATUS: '1' });
  assert.equal(outcome.status, 1);
  assert.match(outcome.stderr, /were not removed/);
});

test('a failed build keeps its status when the removal of the images fails too', () => {
  const outcome = checkReproducible('sha256:same', 'sha256:same', { FAKE_BUILD_STATUS: '3', FAKE_REMOVE_STATUS: '1' });
  assert.equal(outcome.status, 3);
  assert.match(outcome.stderr, /were not removed/);
});

test('a failed read of the commit time stops every build before any image is built', () => {
  const runs: ReadonlyArray<readonly [string, readonly string[], Record<string, string>]> = [
    ['installation.sh', ['build', 'installation-script-test'], {}],
    ['installation.sh', ['check-reproducible', 'installation-script-test'], {}],
    ['harness-qualification.sh', ['{root}/out'], { PLATFORMS: 'linux/amd64' }],
  ];
  for (const [script, args, environment] of runs) {
    const outcome = runInFixture(script, args, { ...environment, FAKE_LOG_STATUS: '24' });
    assert.notEqual(outcome.status, 0, args[0]);
    assert.equal(builds(outcome.calls).length, 0, args[0]);
  }
});

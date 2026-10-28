import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// Reports every service as running, so `certificates` restarts both.
const runningDocker = `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_DOCKER_CALLS"
case " $* " in *" ps --quiet --status running "*) echo container ;; esac
exit 0
`;

test('re-issued certificates are installed, then the running broker and control plane restart', () => {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-certificates-'));
  try {
    writeFileSync(join(root, 'docker'), runningDocker);
    chmodSync(join(root, 'docker'), 0o755);
    const calls = join(root, 'calls');
    writeFileSync(calls, '');
    const run = spawnSync('bash', [script, 'certificates', 'installation-script-test'], {
      encoding: 'utf8', env: { PATH: [root, '/usr/bin', '/bin'].join(':'), FAKE_DOCKER_CALLS: calls },
    });
    assert.equal(run.status, 0, run.stderr);
    const recorded = readFileSync(calls, 'utf8').trim().split('\n');
    const order = ['admin issue-installation-certificates', 'nats-setup', 'restart nats control-plane'].map((call) => indexOfCall(recorded, call));
    assert.ok(order.every((index, position) => index >= 0 && (position === 0 || index > order[position - 1]!)), recorded.join('\n'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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

// Models a build of the tag ending in -first or -second: its metadata
// file, layers, and image ID; FAKE_ statuses fail steps, see the tests.
const buildDocker = `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_DOCKER_CALLS"
case "$*" in
  *-first|*"-first "*) config=$FAKE_FIRST_CONFIG layers=$FAKE_FIRST_LAYERS id=$FAKE_FIRST_ID ;;
  *-second|*"-second "*) config=$FAKE_SECOND_CONFIG layers=$FAKE_SECOND_LAYERS id=$FAKE_SECOND_ID ;;
esac
case "$*" in
  "build "*)
    case "$*" in *"-first "*) [ -z "$FAKE_MOVE_HEAD" ] || GIT_COMMITTER_DATE='@1800000000 +0000' \\
      git -C "$FAKE_MOVE_HEAD" -c user.name=test -c user.email=test@example.invalid \\
      commit --quiet --allow-empty --message moved ;; esac
    previous=
    for argument; do
      [ "$previous" != --metadata-file ] || printf '{"containerimage.config.digest": "%s"}\\n' "$config" > "$argument"
      previous=$argument
    done
    exit "\${FAKE_BUILD_STATUS:-0}" ;;
  "image inspect --format {{.Id}} "*) echo "$id" ;;
  "image inspect --format {{range .RootFS.Layers}}"*) echo "$layers"; exit "\${FAKE_LAYERS_STATUS:-0}" ;;
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

interface WorkerBuild {
  readonly config: string;
  readonly layers: string;
  // The image ID, which the containerd store makes the index digest.
  readonly id: string;
}

const WORKER_BUILD: WorkerBuild = { config: 'sha256:c0f1', layers: 'sha256:base sha256:app ', id: 'sha256:c0f1' };

function checkReproducible(
  first: Partial<WorkerBuild> = {}, second: Partial<WorkerBuild> = {}, environment: Record<string, string> = {},
): BuildOutcome {
  const builds = { FIRST: { ...WORKER_BUILD, ...first }, SECOND: { ...WORKER_BUILD, ...second } };
  const fakes = Object.entries(builds).flatMap(([name, build]) => [
    [`FAKE_${name}_CONFIG`, build.config], [`FAKE_${name}_LAYERS`, build.layers], [`FAKE_${name}_ID`, build.id],
  ]);
  return runInFixture('installation.sh', ['check-reproducible', 'installation-script-test'], {
    ...Object.fromEntries(fakes), ...environment,
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

test('the reproducibility check builds the worker twice without the cache and passes on one image config', () => {
  const outcome = checkReproducible();
  assert.equal(outcome.status, 0, outcome.stderr);
  const [first, second, ...others] = builds(outcome.calls);
  assert.equal(others.length, 0);
  for (const [call, tag] of [[first, 'first'], [second, 'second']] as const) {
    assert.match(call ?? '', /^build --no-cache --metadata-file \S+ .* --target worker --tag taskelith-worker:installation-script-test-/);
    assert.ok(call?.includes(`-${tag} `), call);
    assert.ok(call?.includes(COMMIT_EPOCH_ARGUMENT), call);
  }
  assert.match(outcome.stdout, /both builds gave the worker image config sha256:c0f1/);
  assert.ok(outcome.calls.some((call) => /^image rm .*-first .*-second$/.test(call)), 'both images are removed');
});

test('the reproducibility check passes when only the image IDs differ, as the index digests of the containerd store', () => {
  const outcome = checkReproducible({ id: 'sha256:036dad823c49' }, { id: 'sha256:abc511323824' });
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.match(outcome.stdout, /both builds gave the worker image config sha256:c0f1/);
});

test('the reproducibility check fails and names the differing layer and both image configs', () => {
  const outcome = checkReproducible({}, { config: 'sha256:c0f2', layers: 'sha256:base sha256:other ' });
  assert.equal(outcome.status, 1);
  assert.match(outcome.stderr, /layer 1 differs: sha256:app and sha256:other/);
  assert.doesNotMatch(outcome.stderr, /layer 0/);
  assert.match(outcome.stderr, /the image configs differ: sha256:c0f1 and sha256:c0f2/);
  assert.ok(outcome.calls.some((call) => /^image rm .*-first .*-second$/.test(call)), 'both images are removed');
});

test('the reproducibility check fails on differing image configs over the same layers', () => {
  const outcome = checkReproducible({}, { config: 'sha256:c0f2' });
  assert.equal(outcome.status, 1);
  assert.match(outcome.stderr, /the image configs differ: sha256:c0f1 and sha256:c0f2/);
  assert.doesNotMatch(outcome.stderr, /layer/);
});

test('the reproducibility check names a layer that only one build has', () => {
  const outcome = checkReproducible({}, { layers: 'sha256:base ' });
  assert.equal(outcome.status, 1);
  assert.match(outcome.stderr, /layer 1 differs: sha256:app and none/);
});

test('the reproducibility check fails when a build names no image config digest', () => {
  const outcome = checkReproducible({}, { config: '' });
  assert.equal(outcome.status, 1);
  assert.match(outcome.stderr, /second\.json names no image config digest/);
  assert.doesNotMatch(outcome.stdout, /both builds gave/);
});

test('the reproducibility check fails when the layers of an image cannot be read', () => {
  const outcome = checkReproducible({}, {}, { FAKE_LAYERS_STATUS: '5' });
  assert.equal(outcome.status, 5);
  assert.doesNotMatch(outcome.stdout, /both builds gave/);
});

test('a failed stash of the uncommitted edits stops the build before any image is built', () => {
  for (const command of ['build', 'check-reproducible']) {
    const outcome = runInFixture('installation.sh', [command, 'installation-script-test'], { FAKE_STASH_STATUS: '23' });
    assert.notEqual(outcome.status, 0, command);
    assert.equal(builds(outcome.calls).length, 0, command);
  }
});

test('the reproducibility check builds one commit when HEAD moves between its builds', () => {
  const outcome = checkReproducible({}, {}, { FAKE_MOVE_HEAD: '{root}/repository' });
  assert.equal(outcome.status, 0, outcome.stderr);
  const calls = builds(outcome.calls);
  assert.equal(calls.length, 2);
  for (const call of calls) assert.ok(call.includes(COMMIT_EPOCH_ARGUMENT), call);
});

test('a failed removal of the images fails a passing check and reports it', () => {
  const outcome = checkReproducible({}, {}, { FAKE_REMOVE_STATUS: '1' });
  assert.equal(outcome.status, 1);
  assert.match(outcome.stderr, /were not removed/);
});

test('a failed build keeps its status when the removal of the images fails too', () => {
  const outcome = checkReproducible({}, {}, { FAKE_BUILD_STATUS: '3', FAKE_REMOVE_STATUS: '1' });
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

// Prints the views FAKE_VIEWS/1, /2, ... of successive `worker-admission`
// runs, and FAKE_VIEWS/last after them, each after FAKE_DELAY seconds.
const admissionDocker = `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_DOCKER_CALLS"
case " $* " in
  *" admin worker-admission "*)
    if [ -n "$FAKE_DELAY" ]; then sleep "$FAKE_DELAY"; fi
    count=$(($(cat "$FAKE_VIEWS/count") + 1))
    echo "$count" > "$FAKE_VIEWS/count"
    if [ -f "$FAKE_VIEWS/$count" ]; then cat "$FAKE_VIEWS/$count"; else cat "$FAKE_VIEWS/last"; fi ;;
esac
exit 0
`;

// Delays the decision of every node run by FAKE_NODE_DELAY seconds.
const delayedNode = `#!/bin/sh
sleep "\${FAKE_NODE_DELAY:-0}"
exec "$REAL_NODE" "$@"
`;

const OPERATOR_TOKEN = 'tkop_installation-script-test-secret';
const VIEW_TIME = '2026-10-28T10:00:05.000Z';

function admissionView(admission: string, outcome?: string, details: readonly string[] = []): string {
  const results = outcome === undefined ? [] : [{ checkId: 'linux-containment', outcome, details }];
  return JSON.stringify({ asOf: VIEW_TIME, workers: [{ workerId: 'worker-1', admission, reportedAt: '2026-10-28T10:00:01.000Z', results }] });
}

function checkAdmission(views: readonly string[], environment: Record<string, string> = {}): BuildOutcome {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-admission-'));
  try {
    for (const [name, source] of [['docker', admissionDocker], ['node', delayedNode]]) {
      writeFileSync(join(root, name), source);
      chmodSync(join(root, name), 0o755);
    }
    const temporary = join(root, 'tmp');
    mkdirSync(temporary);
    const directory = join(root, 'views');
    mkdirSync(directory);
    writeFileSync(join(directory, 'count'), '0');
    views.forEach((view, index) => writeFileSync(join(directory, String(index + 1)), view));
    writeFileSync(join(directory, 'last'), views[views.length - 1] ?? '');
    const calls = join(root, 'calls');
    writeFileSync(calls, '');
    const run = spawnSync('bash', [script, 'check-admission', 'installation-script-test'], {
      encoding: 'utf8',
      env: {
        PATH: [root, '/usr/bin', '/bin'].join(':'), REAL_NODE: process.execPath, TMPDIR: temporary,
        FAKE_DOCKER_CALLS: calls, FAKE_VIEWS: directory, TASKELITH_OPERATOR_TOKEN: OPERATOR_TOKEN, ...environment,
      },
    });
    const recorded = readFileSync(calls, 'utf8').trim().split('\n');
    assert.ok(!`${run.stdout}${run.stderr}${recorded.join('\n')}`.includes(OPERATOR_TOKEN), 'the operator secret is never printed');
    assert.deepEqual(readdirSync(temporary), [], 'no temporary file is left');
    return { status: run.status, stdout: run.stdout, stderr: run.stderr, calls: recorded };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const admissionReads = (outcome: Outcome) => outcome.calls.filter((call) => call.endsWith(' admin worker-admission'));

test('the admission check polls the workers view until the worker is admitted with a passed containment check', () => {
  const outcome = checkAdmission([admissionView('awaiting-self-check'), admissionView('admitted', 'passed')]);
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.equal(outcome.stdout.trim(), VIEW_TIME);
  const reads = admissionReads(outcome);
  assert.equal(reads.length, 2);
  for (const read of reads) assert.match(read, /run --rm --no-deps -T --env TASKELITH_OPERATOR_TOKEN admin worker-admission$/);
});

test('a failed self-check fails the admission check at once and names the failed check', () => {
  const outcome = checkAdmission([admissionView('self-check-failed', 'failed', ['the execution account can write cgroup.procs'])]);
  assert.equal(outcome.status, 1);
  assert.equal(admissionReads(outcome).length, 1);
  assert.match(outcome.stderr, /self-check-failed: linux-containment \(the execution account can write cgroup\.procs\)/);
  assert.match(outcome.stderr, /the worker admission check failed/);
});

test('a worker still awaiting its self-check at the deadline fails the admission check as a timeout', () => {
  const outcome = checkAdmission([admissionView('awaiting-self-check')], { TASKELITH_ADMISSION_SECONDS: '3' });
  assert.equal(outcome.status, 3);
  assert.equal(admissionReads(outcome).length, 1, 'no read starts after the bound');
  assert.match(outcome.stderr, /the worker is awaiting-self-check/);
  assert.match(outcome.stderr, /the worker was not admitted within 3s/);
});

function timed(run: () => BuildOutcome): { outcome: BuildOutcome; seconds: number } {
  const started = Date.now();
  const outcome = run();
  return { outcome, seconds: (Date.now() - started) / 1000 };
}

test('a read that hangs is killed at the bound and fails the admission check as a timeout', () => {
  const { outcome, seconds } = timed(() => checkAdmission([admissionView('admitted', 'passed')], {
    TASKELITH_ADMISSION_SECONDS: '2', FAKE_DELAY: '30',
  }));
  assert.equal(outcome.status, 3);
  assert.ok(seconds < 20, `ended after ${seconds}s`);
  assert.match(outcome.stderr, /a read of the workers view did not end in time/);
  assert.match(outcome.stderr, /the worker was not admitted within 2s/);
});

test('a read that would return an admission only after the bound is killed', () => {
  const outcome = checkAdmission([admissionView('admitted', 'passed')], { TASKELITH_ADMISSION_SECONDS: '1', FAKE_DELAY: '3' });
  assert.equal(outcome.status, 3);
  assert.equal(outcome.stdout, '', 'no view time is printed');
  assert.match(outcome.stderr, /a read of the workers view did not end in time/);
  assert.match(outcome.stderr, /the worker was not admitted within 1s/);
});

test('an admission read in time but decided after the bound is a timeout', () => {
  const outcome = checkAdmission([admissionView('admitted', 'passed')], { TASKELITH_ADMISSION_SECONDS: '4', FAKE_NODE_DELAY: '6' });
  assert.equal(outcome.status, 3);
  assert.equal(admissionReads(outcome).length, 1);
  assert.equal(outcome.stdout, '', 'no view time is printed');
  assert.doesNotMatch(outcome.stderr, /did not end in time/);
  assert.match(outcome.stderr, /the worker was not admitted within 4s/);
});

test('a bound with a leading zero is read in base 10', () => {
  const admitted = checkAdmission([admissionView('admitted', 'passed')], { TASKELITH_ADMISSION_SECONDS: '08' });
  assert.equal(admitted.status, 0, admitted.stderr);
  const { outcome, seconds } = timed(() => checkAdmission([admissionView('admitted', 'passed')], {
    TASKELITH_ADMISSION_SECONDS: '010', FAKE_DELAY: '30',
  }));
  assert.equal(outcome.status, 3);
  assert.match(outcome.stderr, /the worker was not admitted within 10s/);
  assert.ok(seconds >= 10, `ended after ${seconds}s, before 10`);
});

test('a refused read of the workers view fails the admission check at once', () => {
  const outcome = checkAdmission([JSON.stringify({ error: { code: 'forbidden', message: 'the operator credential is not valid' } })]);
  assert.equal(outcome.status, 1);
  assert.equal(admissionReads(outcome).length, 1);
  assert.match(outcome.stderr, /could not be read: forbidden: the operator credential is not valid/);
});

test('a bound that is not positive whole seconds is a usage error before any read', () => {
  for (const bound of ['5m', '0', '00']) {
    const outcome = checkAdmission([admissionView('admitted', 'passed')], { TASKELITH_ADMISSION_SECONDS: bound });
    assert.equal(outcome.status, 2, JSON.stringify(bound));
    assert.equal(admissionReads(outcome).length, 0, JSON.stringify(bound));
    assert.match(outcome.stderr, /TASKELITH_ADMISSION_SECONDS must be positive whole seconds/, JSON.stringify(bound));
  }
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// The scenario steps of scripts/installation-scenarios.sh against stubbed
// compose, docker, and psql: the worker's state lives in a file.

const BASH_TIMEOUT_MILLISECONDS = 20_000;
const OLD_START = '2026-10-26T10:00:00.000000000Z';
const NEW_START = '2026-10-26T10:00:05.000000000Z';
const PLANNED = '{"event":"worker.reconciliation.planned","fields":{"inherited":0}}';
const ONLINE = '{"event":"worker.contact.online","fields":{}}';
const REFUSAL = '{"error":{"details":{"reason":"journal-loss"}}}';

interface Stubs {
  readonly state: string;
  readonly stateAfterStart: string;
  readonly logs: readonly string[];
  readonly executions?: string;
}

interface BashRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly elapsed: number;
}

// Stubs replace Docker, PostgreSQL, the operator tool, and the project's
// steps after the library loads; their state lives in files under $stubs.
function stubbed({ state, stateAfterStart, logs, executions = '' }: Stubs, directory: string): string {
  return `
stubs='${directory}'
printf '%s\\n' '${state}' > "$stubs/state"
printf '%s\\n' '${executions}' > "$stubs/executions"
echo w-old > "$stubs/worker"
compose() {
  case "$*" in
    *' start worker') printf '%s\\n' '${stateAfterStart}' > "$stubs/state" ;;
    *' logs '*) printf '%s\\n' ${logs.map((line) => `'${line}'`).join(' ')} ;;
    *' ps '*) echo worker-container ;;
    *revoke-worker*) echo 'e1 started uncertain' > "$stubs/executions" ;;
  esac
}
docker() {
  case "$1" in
    inspect) cat "$stubs/state" ;;
    info) echo 'Stub Engine 1 aarch64' ;;
  esac
}
sql() {
  case "$1" in
    *'FROM workers'*) cat "$stubs/worker" ;;
    *"worker_id = 'w-old'"*) echo 'accepted held' ;;
    *'FROM assignments'*) echo 'ended released' ;;
    *) sed '/^$/d' "$stubs/executions" ;;
  esac
}
in_worker_volume() {
  if [ "$1" = bash ]; then sed '/^$/d' "$stubs/executions"; fi
}
scenario_tool() {
  case "$1" in
    seed) echo 1 ;;
    result) echo pending ;;
    record) echo "$4: $5" >> "$stubs/records" ;;
  esac
}
scenario_project() {
  trap 'finish_scenario $?' EXIT
  url=http://stub
}
enroll() { echo w-new > "$stubs/worker"; }
remove_project() { [ -z "\${CLEANUP_FAILS:-}" ]; }
remove_leftovers() { :; }
scenario=test
smoke_directory="$stubs"
START_SECONDS=2 REFUSAL_SECONDS=2 RESTART_SECONDS=2 RECONCILIATION_SECONDS=2
`;
}

function bash(script: string): BashRun {
  const started = performance.now();
  const result = spawnSync('bash', ['-c', `set -euo pipefail
repository="${process.cwd()}"
source scripts/installation-scenarios.sh
${script}`], { encoding: 'utf8', timeout: BASH_TIMEOUT_MILLISECONDS });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, elapsed: performance.now() - started };
}

interface StubbedRun extends BashRun {
  readonly records: string;
}

function withStubs(stubs: Stubs, script: string): StubbedRun {
  const directory = mkdtempSync(join(tmpdir(), 'taskelith-scenarios-'));
  try {
    const run = bash(`${stubbed(stubs, directory)}\n${script}`);
    const records = existsSync(join(directory, 'records')) ? readFileSync(join(directory, 'records'), 'utf8') : '';
    return { ...run, records };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function awaited(probe: string, seconds: number): BashRun {
  return bash(`${probe}
if await_condition ${seconds} probe; then echo met; else echo timed-out; fi`);
}

test('await_condition answers once its probe succeeds', () => {
  const directory = mkdtempSync(join(tmpdir(), 'taskelith-scenarios-'));
  try {
    const run = awaited(`probe() { echo x >> '${join(directory, 'count')}'; [ "$(wc -l < '${join(directory, 'count')}')" -ge 2 ]; }`, 5);
    assert.equal(run.stdout.trim(), 'met');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('await_condition counts a slow probe against its deadline', () => {
  const run = awaited('probe() { sleep 1.5; return 1; }', 2);
  assert.equal(run.stdout.trim(), 'timed-out');
  assert.ok(run.elapsed < 3_500, `took ${run.elapsed} ms`);
});

test('await_condition kills a blocked probe and its children at the deadline', () => {
  const run = awaited('probe() { sleep 30 | cat; }', 1);
  assert.equal(run.stdout.trim(), 'timed-out');
  assert.ok(run.elapsed < 3_000, `took ${run.elapsed} ms`);
});

test('a worker that refuses the missing journal and exits passes the journal check', () => {
  const run = withStubs({ state: `exited 137 ${OLD_START}`, stateAfterStart: `exited 1 ${NEW_START}`, logs: [REFUSAL] }, 'lose_journal');
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stderr, /exited \(exited 1 .*\) after: .*journal-loss/);
});

test('a worker that logs the refusal but keeps running fails the journal check', () => {
  const run = withStubs({ state: `exited 137 ${OLD_START}`, stateAfterStart: `running 0 ${NEW_START}`, logs: [REFUSAL] }, 'lose_journal');
  assert.equal(run.status, 1);
  assert.match(run.stderr, /did not exit after starting without its journal/);
});

test('a worker that exits without the refusal fails the journal check', () => {
  const run = withStubs({ state: `exited 137 ${OLD_START}`, stateAfterStart: `exited 1 ${NEW_START}`, logs: ['{"error":"other"}'] }, 'lose_journal');
  assert.equal(run.status, 1);
  assert.match(run.stderr, /exited without the journal-loss refusal/);
});

test('a restarted worker that reconciled and stays up passes the kill check', () => {
  const stubs = { state: `running 0 ${NEW_START}`, stateAfterStart: '', logs: [PLANNED, ONLINE], executions: 'e1 started uncertain' };
  const run = withStubs(stubs, `await_restarted_reconciliation worker-kill-task '${OLD_START}' "$(monotonic_milliseconds)"`);
  assert.equal(run.status, 0, run.stderr);
});

test('an execution that had ended does not hide a restart that failed', () => {
  const stubs = { state: `exited 1 ${NEW_START}`, stateAfterStart: '', logs: [PLANNED], executions: 'e1 exited certain' };
  const run = withStubs(stubs, `await_restarted_reconciliation worker-kill-task '${OLD_START}' "$(monotonic_milliseconds)"`);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /no new worker process reached its reconciliation/);
});

test('the killed process itself never counts as the restarted worker', () => {
  const stubs = { state: `running 0 ${OLD_START}`, stateAfterStart: '', logs: [PLANNED, ONLINE], executions: 'e1 exited certain' };
  const run = withStubs(stubs, `await_restarted_reconciliation worker-kill-task '${OLD_START}' "$(monotonic_milliseconds)"`);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /no new worker process reached its reconciliation/);
});

test('an execution left running without uncertainty fails the kill check', () => {
  const stubs = { state: `running 0 ${NEW_START}`, stateAfterStart: '', logs: [PLANNED, ONLINE], executions: 'e1 started certain' };
  const run = withStubs(stubs, `await_restarted_reconciliation worker-kill-task '${OLD_START}' "$(monotonic_milliseconds)"`);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /did not end or become uncertain/);
});

// The restart becomes visible after 0.5 s and the reconciliation 2.8 s
// later: each phase meets its own bound, and only the total tells.
function phasedRestart(reconciliationSeconds: number): StubbedRun {
  const stubs = { state: `exited 137 ${OLD_START}`, stateAfterStart: '', logs: [PLANNED, ONLINE], executions: 'e1 started certain' };
  return withStubs(stubs, `RESTART_SECONDS=2 RECONCILIATION_SECONDS=${reconciliationSeconds}
restart="$(monotonic_milliseconds)"
( sleep 0.5; echo 'running 0 ${NEW_START}' > "$stubs/state"; sleep 2.8; echo 'e1 exited certain' > "$stubs/executions" ) &
await_restarted_reconciliation worker-kill-task '${OLD_START}' "$restart"`);
}

test('the restart and the reconciliation share one deadline from the restart', () => {
  const late = phasedRestart(3);
  assert.equal(late.status, 1);
  assert.match(late.stderr, /did not end or become uncertain in time/);
  assert.equal(phasedRestart(5).status, 0);
});

const DISK_LOSS = { state: `running 0 ${OLD_START}`, stateAfterStart: `exited 1 ${NEW_START}`, logs: [REFUSAL], executions: 'e1 started certain' };
const KILL = { state: `running 0 ${OLD_START}`, stateAfterStart: `running 0 ${NEW_START}`, logs: [PLANNED, ONLINE], executions: 'e1 exited certain' };

test('the disk loss records its pass only after the cleanup', () => {
  const run = withStubs(DISK_LOSS, 'disk_loss_scenario');
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.records, /^passed: on Stub Engine 1 aarch64: worker killed/);
  assert.match(run.stderr, /cleaning up/);
});

test('a failed cleanup of the disk loss is recorded as failed', () => {
  const run = withStubs(DISK_LOSS, 'CLEANUP_FAILS=1 disk_loss_scenario');
  assert.equal(run.status, 1);
  assert.equal(run.records, 'failed: failed while cleaning up\n');
});

test('the worker kill records its pass only after the cleanup', () => {
  const run = withStubs(KILL, 'worker_kill_scenario');
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.records, /^passed: on Stub Engine 1 aarch64: SIGKILL after a planned pause of 1 ms/);
});

test('a failed cleanup of the worker kill is recorded as failed', () => {
  const run = withStubs(KILL, 'CLEANUP_FAILS=1 worker_kill_scenario');
  assert.equal(run.status, 1);
  assert.equal(run.records, 'failed: failed while cleaning up\n');
});

test('an error the scenario did not expect is recorded as failed', () => {
  const run = withStubs(DISK_LOSS, 'unset smoke_directory; disk_loss_scenario');
  assert.equal(run.status, 1);
  assert.equal(run.records, 'failed: failed while submitting a task and awaiting its start\n');
});

// The worker container's answers to the namespace probes. ESCAPE names the
// probe that succeeds and OTHER the one that fails otherwise than expected.
const CONFINEMENT_STUBS = `
GOOD_STATUS='Uid:\\t10003\\t10003\\t10003\\t10003\\nCapEff:\\t0000000000000000\\nCapBnd:\\t00000000000000e0\\nNoNewPrivs:\\t1\\nSeccomp:\\t2\\nSeccomp_filters:\\t1\\n'
probe_answer() {
  if [ "\${ESCAPE:-}" = "$1" ]; then echo created; return 0; fi
  if [ "\${OTHER:-}" = "$1" ]; then echo 'errno 22 Invalid argument' >&2; return 1; fi
  echo "$2" >&2; return 1
}
worker_exec() {
  case "$*" in
    *'/proc/self/status'*) printf "\${PROBE_STATUS:-$GOOD_STATUS}" ;;
    *'pgrep -o -u 10003'*)
      if [ -n "\${UNREADABLE_ONCE:-}" ] && [ ! -e "$stubs/read-once" ]; then : > "$stubs/read-once"; return 1; fi
      printf "\${EXECUTION_STATUS:-$GOOD_STATUS}"; echo cgroup:; echo "\${CGROUP:-0::/executions/e1}" ;;
    'uname -m') echo "\${MACHINE:-aarch64}" ;;
    *'unshare -U true'*) probe_answer user 'unshare: unshare failed: Operation not permitted' ;;
    *'unshare -Urm'*) probe_answer mount 'unshare: unshare failed: Operation not permitted' ;;
    *' 435 0 0') probe_answer clone3 'errno 38' ;;
    *" \$(clone_number_of "\${MACHINE:-aarch64}") 268435473 0 0 0 0") probe_answer clone "errno \${CLONE_ERRNO:-1}" ;;
    *nsenter*) probe_answer setns "nsenter: reassociate to namespace 'ns/user' failed: Operation not permitted" ;;
    'test -d /sys/fs/cgroup/executions') [ -z "\${NO_PARENT:-}" ] ;;
    *'mkdir /sys/fs/cgroup/executions/probe'*) [ -z "\${NO_CGROUP_WRITE:-}" ] ;;
    *) echo "unexpected worker_exec $*" >&2; return 1 ;;
  esac
}
# The retried read takes about a second; the deadline leaves a wide margin.
START_SECONDS=12
clone_number_of() { if [ "$1" = x86_64 ]; then echo 56; else echo 220; fi; }
check_containment() { :; }
applied_profile() { [ -z "\${NO_PROFILE:-}" ] && echo d1gest; }
platform() { echo 'OS Stub; architecture aarch64'; }
`;
const CONFINEMENT = { state: `running 0 ${OLD_START}`, stateAfterStart: '', logs: [], executions: 'e1 started certain' };

function confinement(variables = ''): StubbedRun {
  return withStubs(CONFINEMENT, `${CONFINEMENT_STUBS}\n${variables} namespace_confinement_scenario`);
}

const PROBES = ['user', 'mount', 'clone3', 'clone', 'setns'];

test('refused namespaces, a delegated containment, and an exited task pass the confinement', () => {
  const run = confinement();
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.records, /^passed: OS Stub; architecture aarch64; applied seccomp profile sha256 d1gest, equal to infra\/installation\/seccomp\/worker\.json: the execution e1 ran in '0::\/executions\/e1' with status 'Uid: 10003 10003 10003 10003 CapEff: 0{16} CapBnd: 0{14}e0 NoNewPrivs: 1 Seccomp: 2 Seccomp_filters: 1' and exited 0; .*clone3 answered ENOSYS/);
  for (const label of ['create a user namespace', 'mount a tmpfs', 'call clone3', 'clone into a new user namespace', 'enter a user namespace with setns']) {
    assert.match(run.stderr, new RegExp(`refused to ${label}`));
  }
  assert.match(run.stderr, /cleaning up/);
});

test('any namespace probe that succeeds fails the confinement, the later ones included', () => {
  for (const probe of PROBES) {
    const run = confinement(`ESCAPE=${probe}`);
    assert.equal(run.status, 1, probe);
    assert.match(run.stderr, /the execution account could .*: created/, probe);
    assert.equal(run.records, 'failed: failed while probing namespaces as the execution account\n', probe);
  }
});

test('a refused user namespace does not hide a mount namespace that succeeds', () => {
  const run = confinement('ESCAPE=mount');
  assert.match(run.stderr, /refused to create a user namespace/);
  assert.match(run.stderr, /the execution account could mount a tmpfs in new user and mount namespaces/);
});

test('a probe that fails otherwise than the profile refuses it fails the confinement', () => {
  for (const probe of PROBES) {
    const run = confinement(`OTHER=${probe}`);
    assert.equal(run.status, 1, probe);
    assert.match(run.stderr, /failed otherwise than '.*': errno 22 Invalid argument/, probe);
  }
});

test('an errno probe must answer its exact errno, not one that starts with it', () => {
  const run = confinement('CLONE_ERRNO=13');
  assert.equal(run.status, 1);
  assert.match(run.stderr, /the probe to clone into a new user namespace failed otherwise than 'errno 1': errno 13/);
});

test('a read of the execution that fails at first is retried', () => {
  const run = confinement('UNREADABLE_ONCE=1');
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.records, /^passed: .* ran in '0::\/executions\/e1' with status 'Uid: 10003 10003 10003 10003 CapEff: 0{16} CapBnd: 0{14}e0 NoNewPrivs: 1 Seccomp: 2 Seccomp_filters: 1'/);
});

test('a worker container without the worker profile fails the confinement', () => {
  const run = confinement('NO_PROFILE=1');
  assert.equal(run.status, 1);
  assert.equal(run.records, "failed: failed while checking the worker's containment and its seccomp profile\n");
});

test('a probe whose status differs from the execution fails the confinement', () => {
  const run = confinement(String.raw`PROBE_STATUS='Uid:\t10003\t10003\t10003\t10003\nCapEff:\t0000000000000000\nCapBnd:\t00000000002001e3\nNoNewPrivs:\t1\nSeccomp:\t2\nSeccomp_filters:\t1\n'`);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /the probe's status: expected/);
});

test('an execution and a probe that share a status other than the execution account fail', () => {
  const root = String.raw`'Uid:\t0\t0\t0\t0\nCapEff:\t00000000000000e0\nCapBnd:\t00000000000000e0\nNoNewPrivs:\t1\nSeccomp:\t2\nSeccomp_filters:\t1\n'`;
  const run = confinement(`PROBE_STATUS=${root} EXECUTION_STATUS=${root}`);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /the probe does not run as the execution account/);
});

test('an execution outside its own cgroup fails the confinement', () => {
  for (const cgroup of ['0::/init', '0::/executions/e2']) {
    const run = confinement(`CGROUP=${cgroup}`);
    assert.equal(run.status, 1, cgroup);
    assert.match(run.stderr, /the execution's cgroup: expected '0::\/executions\/e1'/, cgroup);
  }
});

test('an x86_64 worker probes clone by its own syscall number', () => {
  assert.equal(confinement('MACHINE=x86_64').status, 0);
});

test('a host without a clone syscall number fails the confinement', () => {
  const run = confinement('MACHINE=riscv64');
  assert.equal(run.status, 1);
  assert.match(run.stderr, /no clone syscall number for riscv64/);
});

test('a missing containment parent fails the confinement', () => {
  const run = confinement('NO_PARENT=1');
  assert.equal(run.status, 1);
  assert.match(run.stderr, /the containment parent is missing/);
  assert.equal(run.records, 'failed: failed while checking the cgroup delegation\n');
});

test('a containment parent that refuses a cgroup write fails the confinement', () => {
  const run = confinement('NO_CGROUP_WRITE=1');
  assert.equal(run.status, 1);
  assert.match(run.stderr, /the containment parent refused a cgroup write/);
});

test('a failed cleanup of the confinement is recorded as failed', () => {
  const run = confinement('CLEANUP_FAILS=1');
  assert.equal(run.status, 1);
  assert.equal(run.records, 'failed: failed while cleaning up\n');
});

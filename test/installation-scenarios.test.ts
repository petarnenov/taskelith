import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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

// Stubs replace the Docker and PostgreSQL boundaries after the library loads.
function stubbed({ state, stateAfterStart, logs, executions = '' }: Stubs, directory: string): string {
  const stateFile = join(directory, 'state');
  return `
printf '%s\\n' '${state}' > '${stateFile}'
compose() {
  case "$*" in
    *' start worker') printf '%s\\n' '${stateAfterStart}' > '${stateFile}' ;;
    *' logs '*) printf '%s\\n' ${logs.map((line) => `'${line}'`).join(' ')} ;;
    *' ps '*) echo worker-container ;;
  esac
}
docker() {
  case "$1" in
    inspect) cat '${stateFile}' ;;
  esac
}
sql() { printf '%s\\n' '${executions}' | sed '/^$/d'; }
in_worker_volume() { return 0; }
scenario=test
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

function withStubs(stubs: Stubs, script: string): BashRun {
  const directory = mkdtempSync(join(tmpdir(), 'taskelith-scenarios-'));
  try {
    return bash(`${stubbed(stubs, directory)}\n${script}`);
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
  const run = withStubs(stubs, `await_restarted_reconciliation worker-kill-task '${OLD_START}'`);
  assert.equal(run.status, 0, run.stderr);
});

test('an execution that had ended does not hide a restart that failed', () => {
  const stubs = { state: `exited 1 ${NEW_START}`, stateAfterStart: '', logs: [PLANNED], executions: 'e1 exited certain' };
  const run = withStubs(stubs, `await_restarted_reconciliation worker-kill-task '${OLD_START}'`);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /no new worker process reached its reconciliation/);
});

test('the killed process itself never counts as the restarted worker', () => {
  const stubs = { state: `running 0 ${OLD_START}`, stateAfterStart: '', logs: [PLANNED, ONLINE], executions: 'e1 exited certain' };
  const run = withStubs(stubs, `await_restarted_reconciliation worker-kill-task '${OLD_START}'`);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /no new worker process reached its reconciliation/);
});

test('an execution left running without uncertainty fails the kill check', () => {
  const stubs = { state: `running 0 ${NEW_START}`, stateAfterStart: '', logs: [PLANNED, ONLINE], executions: 'e1 started certain' };
  const run = withStubs(stubs, `await_restarted_reconciliation worker-kill-task '${OLD_START}'`);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /did not end or become uncertain/);
});

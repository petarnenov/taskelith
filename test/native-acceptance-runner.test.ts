import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// The runner of make native-acceptance (scripts/native-acceptance.sh) with
// a stubbed tool: what each proof records, and the summary of its log.

function runner(script: string, env: NodeJS.ProcessEnv = process.env): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
  const result = spawnSync('bash', ['-c', `set -euo pipefail
source scripts/native-acceptance.sh
tool() {
  case "$1" in
    context) echo "{\\"row\\":\\"$3\\",\\"proof\\":\\"$4\\"}" ;;
    record) echo "record $2 $3 $4 $5 $6" ;;
    seed) echo 'drew the seed' >&2; echo 7 ;;
  esac
}
build_checkout() { echo 'built the checkout' >&2; }
platform_file=/dev/null entry=macos-26-arm64 TASKELITH_TEST_SEED=9
${script}`], { encoding: 'utf8', timeout: 20_000, env });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('a passing proof records passed with the node:test counts', () => {
  const run = runner(`prove journal-and-storage acceptance-x host-test-suite printf 'ok\\nℹ tests 3\\nℹ pass 3\\nℹ fail 0\\n'
echo "failed:[$failed_proofs]"`);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^record acceptance-x 9 host-test-suite passed exit status 0: tests 3, pass 3, fail 0$/m);
  assert.match(run.stdout, /^failed:\[\]$/m);
  assert.match(run.stderr, /macos-26-arm64 journal-and-storage: printf/);
});

test('a failing proof records failed with its last line and is remembered', () => {
  const run = runner(`prove cancellation acceptance-y compose-installation bash -c 'echo first; echo "last words"; exit 3'
echo "failed:[$failed_proofs]"`);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^record acceptance-y 9 compose-installation failed exit status 3: last words$/m);
  assert.match(run.stdout, /^failed:\[ macos-26-arm64\/acceptance-y\]$/m);
});

test('the proof context names the row and the command, and is unset afterwards', () => {
  const run = runner(`prove connectivity acceptance-z host-test-suite bash -c 'echo "context $TASKELITH_ACCEPTANCE"'
echo "after:[\${TASKELITH_ACCEPTANCE:-}]"`);
  assert.match(run.stdout, /^context \{"row":"connectivity","proof":"bash -c echo "context \$TASKELITH_ACCEPTANCE""\}$/m);
  assert.match(run.stdout, /^after:\[\]$/m);
});

test('the runner needs exactly one results file', () => {
  const run = spawnSync('bash', ['scripts/native-acceptance.sh'], { encoding: 'utf8', timeout: 20_000 });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /usage: native-acceptance.sh RESULTS_FILE/);
});

test('an unknown entry kind is refused before any proof runs', () => {
  const run = runner(`ENTRIES=windows main results.jsonl`);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /unknown entry kind windows; use macos or linux/);
});

test('the macos entry on another host fails early', () => {
  const run = runner(`uname() { echo Linux; }
ENTRIES=macos main results.jsonl`);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /the macos entry runs only on a macOS host, not Linux/);
});

test('the checkout is built before the seed, which needs the built harness', () => {
  const run = runner(`ENTRIES=windows main results.jsonl`);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^built the checkout\ndrew the seed\n/m);
});

test('an early exit removes the platform file and keeps an earlier exit trap', () => {
  const directory = mkdtempSync(join(tmpdir(), 'taskelith-runner-'));
  try {
    const run = runner(`trap 'echo earlier trap' EXIT
ENTRIES=windows main results.jsonl`, { ...process.env, TMPDIR: directory });
    assert.equal(run.status, 2);
    assert.match(run.stdout, /^earlier trap$/m);
    assert.deepEqual(readdirSync(directory), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

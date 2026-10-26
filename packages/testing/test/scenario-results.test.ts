import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { arch, release, tmpdir, type } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  FileScenarioRecorder,
  SCENARIO_RESULTS_VARIABLE,
  discardingScenarioRecorder,
  runEnvironment,
  scenarioRecorderFromEnvironment,
  scenarioResult,
  type RunEnvironment,
  type ScenarioRun,
} from '@taskelith/testing';

const ENVIRONMENT: RunEnvironment = { host: 'Darwin 25.6.0', arch: 'arm64', commit: 'f9ba7a5' };
const RECORDED_AT = new Date('2026-10-26T15:00:00.000Z');
const RUN: ScenarioRun = { scenario: 'worker-disk-loss', seed: 1234, target: 'compose-installation', outcome: 'passed' };

// Git hooks export GIT_DIR; the commit must come from the given directory.
const gitFreeEnv: NodeJS.ProcessEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
);

async function withTemporaryDirectory(body: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'scenario-results-'));
  try {
    await body(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function recordedLines(file: string): Promise<unknown[]> {
  const text = await readFile(file, 'utf8');
  return text.trimEnd().split('\n').map((line) => JSON.parse(line));
}

test('a result carries the run, its rerun hint, the environment, and the time', () => {
  assert.deepEqual(scenarioResult({ ...RUN, detail: 'old attempt uncertain' }, ENVIRONMENT, RECORDED_AT), {
    scenario: 'worker-disk-loss',
    seed: 1234,
    rerunHint: 'rerun with TASKELITH_TEST_SEED=1234',
    host: 'Darwin 25.6.0',
    arch: 'arm64',
    commit: 'f9ba7a5',
    target: 'compose-installation',
    outcome: 'passed',
    detail: 'old attempt uncertain',
    recordedAt: '2026-10-26T15:00:00.000Z',
  });
});

test('a result without detail has no detail field', () => {
  assert.equal('detail' in scenarioResult(RUN, ENVIRONMENT, RECORDED_AT), false);
});

test('a malformed run is rejected', () => {
  const invalid: Array<[Partial<ScenarioRun>, RegExp]> = [
    [{ scenario: 'Worker Disk Loss' }, /lowercase words joined by hyphens/],
    [{ seed: -1 }, /integer from 0 to 2\^32 - 1, got -1/],
    [{ seed: 2 ** 32 }, /got 4294967296/],
    [{ target: 'production' as never }, /target must be one of harness-composition, compose-installation/],
    [{ outcome: 'uncertain' as never }, /outcome must be one of passed, failed/],
  ];
  for (const [change, message] of invalid) {
    assert.throws(() => scenarioResult({ ...RUN, ...change }, ENVIRONMENT, RECORDED_AT), message);
  }
});

test('a file recorder appends one JSON line per result', async () => {
  await withTemporaryDirectory(async (directory) => {
    const file = join(directory, 'results.jsonl');
    const recorder = new FileScenarioRecorder(file, ENVIRONMENT, () => RECORDED_AT);
    await recorder.record(RUN);
    await recorder.record({ ...RUN, scenario: 'worker-sigkill', target: 'harness-composition', outcome: 'failed' });
    assert.deepEqual(await recordedLines(file), [
      scenarioResult(RUN, ENVIRONMENT, RECORDED_AT),
      scenarioResult({ ...RUN, scenario: 'worker-sigkill', target: 'harness-composition', outcome: 'failed' }, ENVIRONMENT, RECORDED_AT),
    ]);
  });
});

test('a file recorder writes nothing for a malformed run', async () => {
  await withTemporaryDirectory(async (directory) => {
    const file = join(directory, 'results.jsonl');
    const recorder = new FileScenarioRecorder(file, ENVIRONMENT, () => RECORDED_AT);
    await assert.rejects(recorder.record({ ...RUN, seed: 1.5 }), /got 1.5/);
    await assert.rejects(readFile(file), { code: 'ENOENT' });
  });
});

test('the discarding recorder accepts a valid run and rejects a malformed one', async () => {
  await discardingScenarioRecorder.record(RUN);
  await assert.rejects(discardingScenarioRecorder.record({ ...RUN, scenario: '' }), /lowercase words/);
});

test('without a results file the environment yields the discarding recorder', () => {
  assert.equal(scenarioRecorderFromEnvironment({ env: {} }), discardingScenarioRecorder);
  assert.equal(scenarioRecorderFromEnvironment({ env: { [SCENARIO_RESULTS_VARIABLE]: '' } }), discardingScenarioRecorder);
});

test('a results file in the environment records relative to the directory', async () => {
  await withTemporaryDirectory(async (directory) => {
    execFileSync('git', ['init', '--quiet'], { cwd: directory, env: gitFreeEnv });
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '--allow-empty', '-m', 'empty'], {
      cwd: directory,
      env: gitFreeEnv,
    });
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, env: gitFreeEnv, encoding: 'utf8' }).trim();
    const env = { ...gitFreeEnv, [SCENARIO_RESULTS_VARIABLE]: 'results.jsonl' };
    const recorder = scenarioRecorderFromEnvironment({ cwd: directory, env });
    assert.ok(recorder instanceof FileScenarioRecorder);
    assert.equal(recorder.file, join(directory, 'results.jsonl'));
    assert.deepEqual(recorder.environment, { host: `${type()} ${release()}`, arch: arch(), commit: head });
    await recorder.record(RUN);
    assert.equal((await recordedLines(recorder.file)).length, 1);
  });
});

test('outside a git repository the environment cannot name a commit', async () => {
  await withTemporaryDirectory(async (directory) => {
    assert.throws(() => runEnvironment({ cwd: directory, env: gitFreeEnv }), /needs the commit, but git rev-parse HEAD failed/);
  });
});

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { localReader, readSshHost, remotePath, type SshRunner } from '../scripts/task-progress-hosts.ts';
import { applyQueue, deriveTasks, LANDED_WINDOW_SECONDS, parseQueue, type TaskProgress } from '../scripts/task-progress-stages.ts';
import {
  acquireLock, cacheAgeSeconds, collectProgress, formatDuration, LOCK_TIMEOUT_SECONDS, progressBar, progressPaths, renderReport,
  runCommand, writeCache, type CollectOptions,
} from '../scripts/task-progress.ts';
import { fixtureEnv } from './git-fixture-env.ts';

const CHANGE = 'demo-task';
const RECORDS = `openspec/changes/${CHANGE}`;
const ARCHIVED = `openspec/changes/archive/2026-10-28-${CHANGE}`;
// Commit times of the fixture, one hour apart from T0.
const T0 = Date.parse('2026-10-28T08:00:00Z') / 1000;
const HOUR = 3600;
const NOW = T0 + 20 * HOUR;

interface Fixture {
  readonly main: string;
  readonly task: string;
  readonly config: string;
  clock: number;
}

function git(root: string, at: number, ...args: string[]): string {
  const date = `${at} +0000`;
  return execFileSync('git', [
    '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args,
  ], { cwd: root, encoding: 'utf8', env: { ...fixtureEnv, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }, stdio: ['ignore', 'pipe', 'pipe'] });
}

function write(root: string, files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

// Commits the files in the task worktree one hour after the last commit.
function commit(fixture: Fixture, files: Readonly<Record<string, string>>, message: string): number {
  fixture.clock += HOUR;
  write(fixture.task, files);
  git(fixture.task, fixture.clock, 'add', '-A');
  git(fixture.task, fixture.clock, 'commit', '-q', '-m', message);
  return fixture.clock;
}

function pass(pass: number, counts: Readonly<Record<string, number>>): string {
  return JSON.stringify({ change: CHANGE, pass, counts: { critical: 0, high: 0, medium: 0, low: 0, ...counts } });
}

// A clone whose origin/dev is the base commit and a task worktree on the
// branch demo-task that starts there.
function withFixture(body: (fixture: Fixture) => void): void {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'taskelith-progress-')));
  const main = join(root, 'main');
  const fixture: Fixture = { main, task: join(root, 'task'), config: join(root, 'config'), clock: T0 };
  try {
    mkdirSync(main);
    git(main, T0, 'init', '-q', '-b', 'dev');
    write(main, { 'src/index.ts': 'export {};\n' });
    git(main, T0, 'add', '-A');
    git(main, T0, 'commit', '-q', '-m', 'base');
    git(main, T0, 'update-ref', 'refs/remotes/origin/dev', 'HEAD');
    git(main, T0, 'worktree', 'add', '-q', '-b', CHANGE, fixture.task, 'origin/dev');
    body(fixture);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function only(fixture: Fixture, now = NOW): TaskProgress {
  const tasks = deriveTasks(localReader, fixture.main, now);
  assert.equal(tasks.length, 1, JSON.stringify(tasks));
  return tasks[0]!;
}

function briefed(fixture: Fixture): number {
  return commit(fixture, { [`${RECORDS}/checklist.json`]: '{}\n', [`${RECORDS}/passes.jsonl`]: '' }, 'docs: brief');
}

function coded(fixture: Fixture): number {
  briefed(fixture);
  return commit(fixture, { 'src/feature.ts': 'export const a = 1;\n' }, 'chore: code');
}

function routed(fixture: Fixture): number {
  coded(fixture);
  return commit(fixture, { [`${RECORDS}/route.json`]: '{}\n' }, 'docs: route');
}

function reviewed(fixture: Fixture, ...passes: string[]): number {
  routed(fixture);
  let at = 0;
  passes.forEach((_, index) => {
    at = commit(fixture, { [`${RECORDS}/passes.jsonl`]: `${passes.slice(0, index + 1).join('\n')}\n` }, `docs: pass ${index + 1}`);
  });
  return at;
}

function archive(fixture: Fixture): number {
  mkdirSync(dirname(join(fixture.task, ARCHIVED)), { recursive: true });
  renameSync(join(fixture.task, RECORDS), join(fixture.task, ARCHIVED));
  return commit(fixture, {}, `docs: archive the demo task change`);
}

function stampDirectory(fixture: Fixture): string {
  return join(fixture.main, '.git', 'taskelith-verify-stamps');
}

function writeStamp(fixture: Fixture, name: string, fields: Readonly<Record<string, string>>): void {
  mkdirSync(stampDirectory(fixture), { recursive: true });
  writeFileSync(join(stampDirectory(fixture), name), `${JSON.stringify(fields)}\n`);
}

test('stage 1 brief: the checklist commit starts the task', () => {
  withFixture((fixture) => {
    const at = briefed(fixture);
    const task = only(fixture);
    assert.deepEqual([task.change, task.stage, task.stageName, task.startedAt], [CHANGE, 1, 'brief', at]);
  });
});

test('stage 1 brief: an uncommitted checklist counts from its file time', () => {
  withFixture((fixture) => {
    write(fixture.task, { [`${RECORDS}/checklist.json`]: '{}\n' });
    utimesSync(join(fixture.task, RECORDS, 'checklist.json'), T0 + 5, T0 + 5);
    assert.equal(only(fixture).startedAt, T0 + 5);
  });
});

test('stage 2 code: only commits outside openspec count', () => {
  withFixture((fixture) => {
    briefed(fixture);
    commit(fixture, { [`${RECORDS}/design.md`]: '# Design\n' }, 'docs: design');
    assert.equal(only(fixture).stage, 1);
    const at = commit(fixture, { 'src/feature.ts': 'export {};\n' }, 'chore: code');
    assert.deepEqual(only(fixture).reached.map((stage) => [stage.name, stage.at]), [['brief', T0 + HOUR], ['code', at]]);
  });
});

test('stage 3 verify: a stamp of the clean tree and its merge base', () => {
  withFixture((fixture) => {
    coded(fixture);
    const tree = git(fixture.task, 0, 'rev-parse', 'HEAD^{tree}').trim();
    const base = git(fixture.task, 0, 'rev-parse', 'origin/dev').trim();
    writeStamp(fixture, 'other-base', { tree, base: '0'.repeat(40), verifiedAt: '2026-10-28T10:00:00.000Z' });
    assert.equal(only(fixture).stage, 2, 'a stamp of another merge base');
    writeStamp(fixture, 'match', { tree, base, verifiedAt: '2026-10-28T11:30:00.000Z' });
    const task = only(fixture);
    assert.deepEqual([task.stage, task.reached.at(-1)?.at], [3, Date.parse('2026-10-28T11:30:00.000Z') / 1000]);
    write(fixture.task, { 'src/dirty.ts': '\n' });
    assert.equal(only(fixture).stage, 2, 'a dirty tree has no stamp');
  });
});

test('stage 4 route: route.json', () => {
  withFixture((fixture) => {
    const at = routed(fixture);
    const task = only(fixture);
    assert.deepEqual([task.stage, task.stageName, task.reached.at(-1)?.at], [4, 'route', at]);
  });
});

test('stages 5 to 7: one stage per line of passes.jsonl, timed by its commit', () => {
  withFixture((fixture) => {
    const at = reviewed(fixture, pass(1, { medium: 1 }), pass(2, { high: 1 }), pass(3, { low: 1 }));
    const task = only(fixture);
    assert.deepEqual([task.stage, task.stageName, task.review.passes], [7, 'review 3', 3]);
    assert.deepEqual(task.reached.slice(-3).map((stage) => stage.at), [at - 2 * HOUR, at - HOUR, at]);
  });
});

test('the review stops at a Low-only pass', () => {
  withFixture((fixture) => {
    reviewed(fixture, pass(1, { medium: 2 }));
    assert.deepEqual(only(fixture).review, { passes: 1, stopped: false });
    commit(fixture, { [`${RECORDS}/passes.jsonl`]: `${pass(1, { medium: 2 })}\n${pass(2, { low: 3 })}\n` }, 'docs: pass 2');
    const task = only(fixture);
    assert.deepEqual([task.stage, task.review], [6, { passes: 2, stopped: true }]);
    assert.match(renderReport({ generatedAt: '', generatedAtEpoch: NOW, problems: [], hosts: [{ name: 'local', status: 'ok', tasks: [task] }] }),
      /6\/11 review 2, review done at a Low-only pass/);
  });
});

test('stage 8 fixes: commits after the last pass record', () => {
  withFixture((fixture) => {
    reviewed(fixture, pass(1, { low: 1 }));
    assert.equal(only(fixture).stage, 5);
    const at = commit(fixture, { 'src/feature.ts': 'export const fixed = 1;\n' }, 'chore: fix');
    const task = only(fixture);
    assert.deepEqual([task.stage, task.stageName, task.reached.at(-1)?.at], [8, 'fixes', at]);
  });
});

test('stage 9 archived: the archive commit is the last commit', () => {
  withFixture((fixture) => {
    reviewed(fixture, pass(1, { low: 1 }));
    const at = archive(fixture);
    const task = only(fixture);
    assert.deepEqual([task.stage, task.stageName, task.reached.at(-1)?.at], [9, 'archived', at]);
    assert.equal(task.reached.some((stage) => stage.name === 'fixes'), false, 'the archive commit is no fix');
    assert.equal(task.reached.find((stage) => stage.name === 'review 1')?.at, at - HOUR, 'passes read from the archived path');
  });
});

test('stage 10 handed off: the branch is in the integration queue', () => {
  withFixture((fixture) => {
    routed(fixture);
    archive(fixture);
    const queued = parseQueue(JSON.stringify([{ label: 'demo', branch: CHANGE }, { label: 'other' }]));
    const [task] = applyQueue([only(fixture)], queued);
    assert.deepEqual([task?.stage, task?.stageName], [10, 'handed off']);
    assert.equal(applyQueue([only(fixture)], parseQueue('not json'))[0]?.stage, 9);
  });
});

test('stage 11 landed: merged into origin/dev, shown for a day', () => {
  withFixture((fixture) => {
    reviewed(fixture, pass(1, { low: 1 }));
    archive(fixture);
    const landedAt = fixture.clock + HOUR;
    git(fixture.main, landedAt, 'merge', '-q', '--no-ff', '-m', 'Merge pull request', CHANGE);
    git(fixture.main, landedAt, 'update-ref', 'refs/remotes/origin/dev', 'HEAD');
    const task = only(fixture);
    assert.deepEqual([task.stage, task.stageName, task.landedAt], [11, 'landed', landedAt]);
    assert.equal(task.reached.find((stage) => stage.name === 'code')?.at, T0 + 2 * HOUR, 'the base before the landing');
    assert.deepEqual(applyQueue([task], new Set([CHANGE]))[0]?.stage, 11);
    assert.deepEqual(deriveTasks(localReader, fixture.main, landedAt + LANDED_WINDOW_SECONDS + 1), []);
  });
});

test('worktrees without an open change, dev, and integration branches are skipped', () => {
  withFixture((fixture) => {
    git(fixture.main, T0, 'worktree', 'add', '-q', '-b', 'itg-demo', join(fixture.main, '..', 'itg'), 'origin/dev');
    write(join(fixture.main, '..', 'itg'), { [`${RECORDS}/checklist.json`]: '{}\n' });
    write(fixture.main, { [`${RECORDS}/checklist.json`]: '{}\n' });
    assert.deepEqual(deriveTasks(localReader, fixture.main, NOW), []);
  });
});

function localShell(): SshRunner {
  return (_target, command) => {
    const result = spawnSync('sh', ['-c', command], { encoding: 'utf8', env: fixtureEnv });
    return { status: result.status ?? 255, stdout: result.stdout };
  };
}

test('an SSH host without the script is read with git and shell commands', () => {
  withFixture((fixture) => {
    reviewed(fixture, pass(1, { low: 1 }));
    const tree = git(fixture.task, 0, 'rev-parse', 'HEAD^{tree}').trim();
    writeStamp(fixture, 'match', { tree, base: git(fixture.task, 0, 'rev-parse', 'origin/dev').trim(), verifiedAt: '2026-10-28T12:00:00.000Z' });
    const report = readSshHost(localShell(), { name: 'Zaki', ssh: 'zaki', repo: fixture.main }, NOW);
    assert.deepEqual(report, { name: 'Zaki', status: 'ok', tasks: deriveTasks(localReader, fixture.main, NOW) });
    assert.equal(report.tasks[0]?.stage, 5);
  });
});

test('an SSH host with the script returns its tasks; failures are reported', () => {
  const host = { name: 'Zaki', ssh: 'zaki', repo: '~/taskelith' };
  const commands: string[] = [];
  const answer = (status: number, stdout: string): SshRunner => (_target, command) => {
    commands.push(command);
    return { status, stdout };
  };
  assert.deepEqual(readSshHost(answer(0, '[{"branch":"x"}]'), host, NOW).tasks, [{ branch: 'x' }]);
  assert.match(commands[0]!, /^cd "\$HOME"\/'taskelith' /);
  assert.deepEqual(readSshHost(answer(65, ''), host, NOW), { name: 'Zaki', status: 'error', tasks: [], detail: 'no clone at ~/taskelith' });
  assert.equal(readSshHost(answer(0, 'nvm noise'), host, NOW).status, 'error');
  assert.equal(readSshHost(answer(1, ''), host, NOW).detail, 'remote script exited with 1');
  assert.equal(remotePath("/a b/it's"), `'/a b/it'\\''s'`);
});

function options(fixture: Fixture, ssh: SshRunner, now = new Date(NOW * 1000)): CollectOptions {
  return { repo: fixture.main, paths: progressPaths(fixture.config), ssh, now };
}

test('an unreachable host is reported and never fails the run', () => {
  withFixture((fixture) => {
    briefed(fixture);
    write(fixture.config, { 'progress-hosts.json': JSON.stringify([{ name: 'Zaki', ssh: 'petar@hpz600', repo: '~/taskelith' }]) });
    const result = runCommand(['show'], options(fixture, () => ({ status: 255, stdout: '' })));
    assert.equal(result.status, 0);
    assert.match(result.stdout, /^local {2}demo-task {2}█░{10} {2}1\/11 brief {2}19h00m$/m);
    assert.match(result.stdout, /^Zaki {2}unreachable$/m);
  });
});

test('an invalid hosts file is reported and the local host still shows', () => {
  withFixture((fixture) => {
    write(fixture.config, { 'progress-hosts.json': '{"name":"Zaki"}' });
    const report = collectProgress(options(fixture, () => assert.fail('no host to reach')));
    assert.deepEqual(report.problems, ['the hosts file is not a JSON list of {name, ssh, repo}']);
    assert.match(renderReport(report), /^local {2}no open task$/m);
  });
});

test('the cache is written atomically with its timestamp and refreshed only when old', () => {
  withFixture((fixture) => {
    briefed(fixture);
    const paths = progressPaths(fixture.config);
    const unreachable: SshRunner = () => ({ status: 255, stdout: '' });
    assert.match(runCommand(['refresh'], options(fixture, unreachable)).stdout, /: 1 active task\(s\)/);
    const cached = JSON.parse(readFileSync(paths.cache, 'utf8')) as { generatedAtEpoch: number; hosts: { tasks: TaskProgress[] }[] };
    assert.deepEqual([cached.generatedAtEpoch, cached.hosts[0]?.tasks[0]?.change], [NOW, CHANGE]);
    assert.deepEqual(readdirSync(fixture.config).sort(), ['progress.json'], 'no temporary file and no lock remain');
    assert.equal(cacheAgeSeconds(paths.cache, new Date((NOW + 45) * 1000)), 45);
    const fresh = runCommand(['refresh', '--if-older-than', '60'], options(fixture, unreachable, new Date((NOW + 45) * 1000)));
    assert.equal(fresh.stdout, 'progress cache is 45 s old\n');
    runCommand(['refresh', '--if-older-than', '60'], options(fixture, unreachable, new Date((NOW + 61) * 1000)));
    assert.equal(cacheAgeSeconds(paths.cache, new Date((NOW + 61) * 1000)), 0, 'a stale cache is rewritten');
    writeCache(paths.cache, { generatedAt: '', generatedAtEpoch: 1, problems: [], hosts: [] });
    assert.equal(cacheAgeSeconds(paths.cache, new Date(11_000)), 10);
    writeFileSync(paths.cache, 'garbage');
    assert.equal(cacheAgeSeconds(paths.cache, new Date()), undefined);
  });
});

test('one refresh at a time: a live lock blocks, a dead one is taken over', () => {
  withFixture((fixture) => {
    const paths = progressPaths(fixture.config);
    const now = new Date();
    assert.equal(acquireLock(paths.lock, now), true);
    assert.equal(acquireLock(paths.lock, now), false);
    const blocked = runCommand(['refresh'], options(fixture, () => assert.fail('no refresh while locked'), now));
    assert.deepEqual([blocked.stdout, existsSync(paths.cache)], ['another progress refresh is running\n', false]);
    const later = new Date(now.getTime() + (LOCK_TIMEOUT_SECONDS + 1) * 1000);
    assert.equal(acquireLock(paths.lock, later), true, 'a lock older than the timeout');
  });
});

test('durations, bars, and usage', () => {
  assert.deepEqual([formatDuration(59), formatDuration(4320), formatDuration(26 * HOUR)], ['0m', '1h12m', '1d2h']);
  assert.equal(progressBar(4), '████░░░░░░░');
  assert.equal(runCommand(['refresh', '--if-older-than', 'x'], {} as CollectOptions).status, 2);
  assert.equal(runCommand(['unknown'], {} as CollectOptions).status, 2);
});

test('local-json prints the tasks of this clone for a remote caller', () => {
  withFixture((fixture) => {
    briefed(fixture);
    const result = runCommand(['local-json'], options(fixture, () => assert.fail('local only')));
    assert.deepEqual(JSON.parse(result.stdout), deriveTasks(localReader, fixture.main, NOW));
  });
});

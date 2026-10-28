import assert from 'node:assert/strict';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { failed, value, withholdCoverageFromDescendants } from '@taskelith/testing';
import { GitRunner, scrubCredential, verifyGitClient } from '@taskelith/git-workspace';
import {
  GIT_NEUTRAL_DIRECTORY,
  REDACTED_VALUE,
  gitConfigEnvironment,
  gitProcessProblems,
  holdsSensitive,
  redactedHeader,
  sensitiveValues,
  type GitClientPin,
} from '@taskelith/workspace';
import { credential, nativeGit, recordingPin, runProcess, systemGitVersion, SYSTEM_GIT } from './git-fixture.ts';

// Node adds NODE_V8_COVERAGE to every child's environment, even a
// built one, while this test process collects coverage.
withholdCoverageFromDescendants();

const WRITE = credential('write', ['acme/project'], ['read-code', 'write-code']);
const SENSITIVE = sensitiveValues([WRITE]);
let scratch: string;
let pin: GitClientPin;
let logDirectory: string;

before(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'taskelith-git-runner-'));
  ({ pin, logDirectory } = await recordingPin(scratch));
});

after(() => rm(scratch, { recursive: true, force: true }));

// The raw environment the wrapper recorded for its latest process.
async function lastProcess(): Promise<{ argv: string[]; environment: Record<string, string>; cwd: string }> {
  const name = (await readdir(logDirectory)).filter((entry) => !entry.endsWith('.tmp')).sort().at(-1)!;
  const read = (file: string) => readFile(join(logDirectory, name, file), 'utf8');
  const pairs = (await read('env')).split('\0').filter(Boolean).map((pair) => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]);
  return { argv: (await read('argv')).split('\0'), environment: Object.fromEntries(pairs), cwd: await read('cwd') };
}

// Variables a worker's own environment could hand down to Git.
const INHERITED = {
  XDG_CONFIG_HOME: '/home/worker/.config', https_proxy: 'http://proxy.example:3128', SSH_ASKPASS: '/usr/bin/ask',
  GIT_CONFIG_PARAMETERS: "'core.pager=planted'", GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: '/planted',
  GIT_TRACE: '1', SUDO_UID: '10003', GIT_CONFIG_GLOBAL: '/attacker/config',
};

async function withEnvironment<T>(extra: Record<string, string>, run: () => Promise<T>): Promise<T> {
  const saved = { ...process.env };
  Object.assign(process.env, extra);
  try {
    return await run();
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

test('every Git process gets exactly the built environment, not the inherited one', async () => {
  const runner = new GitRunner(pin);
  await withEnvironment(INHERITED, async () => {
    value(await runner.run({ args: ['--version'], cwd: GIT_NEUTRAL_DIRECTORY }));
    assert.deepEqual((await lastProcess()).environment, gitConfigEnvironment());
    value(await runner.run({ args: ['--version'], cwd: GIT_NEUTRAL_DIRECTORY, credential: WRITE }));
    assert.deepEqual((await lastProcess()).environment, gitConfigEnvironment(WRITE.authorization));
  });
});

test('the header travels in the environment of the one process, never in an argument', async () => {
  const runner = new GitRunner(pin);
  value(await runner.run({ args: ['--version'], cwd: GIT_NEUTRAL_DIRECTORY, credential: WRITE }));
  const recorded = await lastProcess();
  const header = `Authorization: ${WRITE.authorization}`;
  const environment = Object.fromEntries(Object.entries(recorded.environment).map(([key, text]) => [key, text === header ? redactedHeader(WRITE.credentialId) : text]));
  const process_ = { ...recorded, pid: 1, environment, repositoryConfig: null };
  assert.deepEqual(gitProcessProblems(process_, { credentialId: WRITE.credentialId, clientPath: pin.path }, SENSITIVE), []);
  assert.equal(recorded.argv.some((arg) => holdsSensitive(arg, SENSITIVE)), false);
});

test('the runner starts the pinned path even when another git comes first in PATH', async () => {
  const decoy = join(scratch, 'decoy');
  await mkdir(decoy, { recursive: true });
  const marker = join(scratch, 'decoy-ran');
  await writeFile(join(decoy, 'git'), `#!/bin/sh\ntouch ${marker}\n`);
  await chmod(join(decoy, 'git'), 0o755);
  await withEnvironment({ PATH: `${decoy}:${process.env.PATH ?? ''}` }, async () => {
    value(await new GitRunner(pin).run({ args: ['--version'], cwd: GIT_NEUTRAL_DIRECTORY }));
  });
  assert.equal((await lastProcess()).argv[0], pin.path);
  await assert.rejects(lstat(marker), { code: 'ENOENT' });
});

test('every credential form is scrubbed from captured output', () => {
  const afterScheme = WRITE.authorization.split(' ')[1]!;
  const text = [WRITE.secret, WRITE.authorization, afterScheme, btoa(WRITE.secret), btoa(afterScheme), 'kept'].join('\n');
  const scrubbed = scrubCredential(text, WRITE);
  assert.equal(holdsSensitive(scrubbed, SENSITIVE), false);
  assert.match(scrubbed, /kept$/);
  assert.equal(scrubbed.split(REDACTED_VALUE).length - 1, 5);
  assert.equal(scrubCredential('no credential', undefined), 'no credential');
});

test('standard error of a Git process never holds a credential form', async () => {
  const echo = join(scratch, 'echo-header');
  const header = `"$GIT_CONFIG_VALUE_${gitConfigEnvironment().GIT_CONFIG_COUNT}"`;
  await writeFile(echo, `#!/bin/sh\necho ${header} >&2\necho ${header} | cut -d' ' -f3 | base64 -d >&2\necho >&2\necho out\n`);
  await chmod(echo, 0o755);
  const output = value(await new GitRunner({ path: echo, version: '' }).run({ args: [], cwd: GIT_NEUTRAL_DIRECTORY, credential: WRITE }));
  assert.equal(holdsSensitive(output.stderr, SENSITIVE), false);
  assert.match(output.stderr, new RegExp(REDACTED_VALUE));
  assert.equal(new TextDecoder().decode(output.stdout), 'out\n');
});

test('the runner feeds standard input and reports the exit code', async () => {
  const runner = new GitRunner(pin);
  const input = new TextEncoder().encode('content\n');
  const hashed = value(await runner.run({ args: ['hash-object', '--stdin'], cwd: GIT_NEUTRAL_DIRECTORY, input }));
  const expected = (await nativeGit(GIT_NEUTRAL_DIRECTORY, ['hash-object', '--stdin'], { input })).toString('utf8');
  assert.deepEqual([hashed.exitCode, new TextDecoder().decode(hashed.stdout)], [0, expected]);
  const outside = value(await runner.run({ args: ['rev-parse', '--git-dir'], cwd: GIT_NEUTRAL_DIRECTORY }));
  assert.notEqual(outside.exitCode, 0);
  assert.match(outside.stderr, /not a git repository/);
});

test('a client that cannot start is unavailable', async () => {
  const failure = failed(await new GitRunner({ path: join(scratch, 'missing'), version: '' }).run({ args: [], cwd: GIT_NEUTRAL_DIRECTORY }));
  assert.equal(failure.code, 'unavailable');
});

test('the Git client gate accepts only the pinned version string', async () => {
  const client = value(await verifyGitClient(pin));
  assert.equal(client.runner.pin, pin);
  assert.deepEqual((await lastProcess()).argv, [pin.path, '--version']);
  assert.equal((await lastProcess()).cwd, GIT_NEUTRAL_DIRECTORY);
  for (const other of [{ ...pin, version: 'git version 2.56.0' }, { path: join(scratch, 'missing'), version: await systemGitVersion() }]) {
    const failure = failed(await verifyGitClient(other));
    assert.deepEqual([failure.code, failure.details.reason], ['precondition-failed', 'git-client-mismatch']);
  }
  const system = (await runProcess(SYSTEM_GIT, ['--version'])).stdout.toString('utf8').trim();
  assert.equal(pin.version, system);
});

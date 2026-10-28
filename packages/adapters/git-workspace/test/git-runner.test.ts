import assert from 'node:assert/strict';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { failed, value } from '@taskelith/testing';
import { GIT_TIME_LIMIT_MS, GitRunner, scrubCredential, verifyGitClient, type VerifiedGitClient } from '@taskelith/git-workspace';
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
  NODE_V8_COVERAGE: '/nonexistent/coverage',
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

// A client that prints the header and its decoded form on both streams.
async function echoingClient(): Promise<GitClientPin> {
  const echo = join(scratch, 'echo-header');
  const header = `"$GIT_CONFIG_VALUE_${gitConfigEnvironment().GIT_CONFIG_COUNT}"`;
  const lines = `echo ${header}\necho ${header} | cut -d' ' -f3 | base64 -d\necho\n`;
  await writeFile(echo, `#!/bin/sh\n{\n${lines}} >&2\n${lines}printf 'out\\377\\n'\n`);
  await chmod(echo, 0o755);
  return { path: echo, version: '' };
}

test('no output stream of a Git process holds a credential form', async () => {
  const output = value(await new GitRunner(await echoingClient()).run({ args: [], cwd: GIT_NEUTRAL_DIRECTORY, credential: WRITE }));
  const stdout = Buffer.from(output.stdout);
  for (const stream of [output.stderr, stdout.toString('latin1')]) {
    assert.equal(holdsSensitive(stream, SENSITIVE), false);
    assert.match(stream, new RegExp(REDACTED_VALUE));
  }
  assert.ok(stdout.subarray(-5).equals(Buffer.from('out\xff\n', 'latin1')), 'other bytes survive');
});

test('a credential whose secret is short is still scrubbed in every form', async () => {
  const secret = 'abc';
  const short = { ...WRITE, secret, authorization: `Basic ${btoa(`x-access-token:${secret}`)}` };
  const scrubbed = scrubCredential(`secret=${secret} base64=${btoa(secret)} header=${short.authorization}`, short);
  assert.equal(scrubbed, `secret=${REDACTED_VALUE} base64=${REDACTED_VALUE} header=${REDACTED_VALUE}`);
  const output = value(await new GitRunner(await echoingClient()).run({ args: [], cwd: GIT_NEUTRAL_DIRECTORY, credential: short }));
  for (const stream of [output.stderr, Buffer.from(output.stdout).toString('latin1')]) {
    assert.equal(stream.includes(secret) || stream.includes(btoa(`x-access-token:${secret}`)), false, stream);
  }
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

test('only the gate makes a verified client, also for the type checker', () => {
  // @ts-expect-error A client with a runner alone has not passed the gate.
  const unverified: VerifiedGitClient = { runner: new GitRunner(pin) };
  assert.equal(unverified.runner.pin, pin);
});

// A client that records its process and its background child, then
// waits for that child, which outlives the time limit.
async function stallingClient(): Promise<{ pin: GitClientPin; pids: string }> {
  const path = join(scratch, 'stall');
  const pids = join(scratch, 'stall-pids');
  await writeFile(path, `#!/bin/sh\nsleep 600 &\necho "$$ $!" > ${pids}\nwait\n`);
  await chmod(path, 0o755);
  return { pin: { path, version: '' }, pids };
}

// Waits on the condition, never a fixed time, with wide slack.
async function gone(pid: number): Promise<boolean> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ESRCH';
    }
    if (Date.now() > deadline) return false;
    await new Promise((next) => setImmediate(next));
  }
}

test('a process past its time limit is killed with its group, remote unavailable, local internal', async () => {
  const { pin: stalling, pids } = await stallingClient();
  // Far above the few milliseconds the shell needs to record its pids.
  const runner = new GitRunner(stalling, 1_000);
  for (const [credential, code] of [[undefined, 'internal'], [WRITE, 'unavailable']] as const) {
    await rm(pids, { force: true });
    const started = Date.now();
    const failure = failed(await runner.run({ args: [], cwd: GIT_NEUTRAL_DIRECTORY, credential }));
    assert.ok(Date.now() - started >= 1_000);
    assert.equal(failure.code, code);
    assert.match(failure.message, /longer than 1000 ms/);
    const [leader, child] = (await readFile(pids, 'utf8')).trim().split(' ').map(Number);
    assert.equal(await gone(-leader!), true, 'the process group survived');
    assert.equal(await gone(child!), true, 'the background child survived');
  }
});

test('the time limit is ten minutes by default and must be a positive whole number', () => {
  assert.equal(GIT_TIME_LIMIT_MS, 600_000);
  assert.equal(new GitRunner(pin).timeLimitMs, GIT_TIME_LIMIT_MS);
  assert.equal(new GitRunner(pin).withTimeLimit(1_000).timeLimitMs, 1_000);
  for (const invalid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => new GitRunner(pin, invalid), RangeError);
  }
});

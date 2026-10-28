import assert from 'node:assert/strict';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { err, failure, ok } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';
import {
  GIT_TIME_LIMIT_MS,
  GitRunner,
  MAX_GIT_TIME_LIMIT_MS,
  scrubCredential,
  systemGitTimer,
  verifyGitClient,
  type VerifiedGitClient,
} from '@taskelith/git-workspace';
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
import { ManualGitTimer, within, credential, nativeGit, recordingPin, runProcess, systemGitVersion, SYSTEM_GIT } from './git-fixture.ts';

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

test('a client that cannot start is unavailable, its message scrubbed', async () => {
  const missing = new GitRunner({ path: join(scratch, 'missing'), version: '' });
  const failure = failed(await missing.run({ args: [], cwd: GIT_NEUTRAL_DIRECTORY }));
  assert.equal(failure.code, 'unavailable');
  const short = credential('short', ['acme/project'], ['read-code'], 'missing');
  const scrubbed = failed(await missing.run({ args: [], cwd: GIT_NEUTRAL_DIRECTORY, credential: short }));
  assert.match(scrubbed.message, new RegExp(`cannot start ${scratch}/${REDACTED_VALUE}`));
  assert.equal(scrubbed.message.includes('missing'), false);
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
// waits for that child, which outlives any time limit.
async function stallingClient(): Promise<{ pin: GitClientPin; pids: string }> {
  const path = join(scratch, 'stall');
  const pids = join(scratch, 'stall-pids');
  await writeFile(path, `#!/bin/sh\nsleep 600 &\necho "$$ $!" > ${pids}.tmp\nmv ${pids}.tmp ${pids}\nwait\n`);
  await chmod(path, 0o755);
  return { pin: { path, version: '' }, pids };
}

// Wide slack for a loaded host; the awaited work takes milliseconds.
const CONDITION_WITHIN_MS = 30_000;

// Waits on the condition, never a fixed time.
async function until(condition: () => Promise<boolean>): Promise<boolean> {
  const deadline = Date.now() + CONDITION_WITHIN_MS;
  for (;;) {
    if (await condition()) return true;
    if (Date.now() > deadline) return false;
    await new Promise((next) => setImmediate(next));
  }
}

const exists = (path: string) => lstat(path).then(() => true, () => false);

function gone(pid: number): Promise<boolean> {
  return until(async () => {
    try {
      process.kill(pid, 0);
      return false;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ESRCH';
    }
  });
}

function killLeftovers(pids: readonly number[]): void {
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  }
}

test('a process past its time limit is killed with its group, remote unavailable, local internal', async () => {
  const { pin: stalling, pids } = await stallingClient();
  for (const [credential, code] of [[undefined, 'internal'], [WRITE, 'unavailable']] as const) {
    await rm(pids, { force: true });
    const timer = new ManualGitTimer();
    const running = new GitRunner(stalling, 1_000, timer.timer).run({ args: [], cwd: GIT_NEUTRAL_DIRECTORY, credential });
    let recorded: number[] = [];
    try {
      await timer.armed();
      assert.equal(await until(() => exists(pids)), true, 'the client never recorded its pids');
      recorded = (await readFile(pids, 'utf8')).trim().split(' ').map(Number);
      timer.expire();
      const failure = failed(await within(running, CONDITION_WITHIN_MS));
      assert.deepEqual(timer.limits, [1_000]);
      assert.equal(failure.code, code);
      assert.match(failure.message, /longer than 1000 ms/);
      const [leader, child] = recorded;
      assert.equal(await gone(-leader!), true, 'the process group survived');
      assert.equal(await gone(child!), true, 'the background child survived');
    } finally {
      timer.expire();
      killLeftovers(recorded.length > 0 ? [-recorded[0]!, recorded[1]!] : []);
    }
  }
});

test('the time limit message is scrubbed of a credential form in the client path', async () => {
  const { pin: stalling, pids } = await stallingClient();
  const short = credential('short', ['acme/project'], ['read-code'], 'stall');
  const timer = new ManualGitTimer();
  const running = new GitRunner(stalling, 1_000, timer.timer).run({ args: [], cwd: GIT_NEUTRAL_DIRECTORY, credential: short });
  try {
    await timer.armed();
    timer.expire();
    const failure = failed(await within(running, CONDITION_WITHIN_MS));
    assert.equal(failure.message, `${scratch}/${REDACTED_VALUE} ran longer than 1000 ms and was killed`);
  } finally {
    timer.expire();
    if (await exists(pids)) killLeftovers([-Number((await readFile(pids, 'utf8')).split(' ')[0])]);
  }
});

test('the system timer expires after its delay unless disarmed', async () => {
  await new Promise<void>((expired) => systemGitTimer(expired, 1));
  let fired = false;
  const disarm = systemGitTimer(() => (fired = true), 1);
  disarm();
  await new Promise<void>((later) => systemGitTimer(later, 5));
  assert.equal(fired, false);
});

test('the time limit is ten minutes by default and must fit the timer', () => {
  assert.equal(GIT_TIME_LIMIT_MS, 600_000);
  assert.equal(MAX_GIT_TIME_LIMIT_MS, 2_147_483_647);
  assert.equal(new GitRunner(pin).timeLimitMs, GIT_TIME_LIMIT_MS);
  assert.equal(new GitRunner(pin).withTimeLimit(1_000).timeLimitMs, 1_000);
  assert.equal(new GitRunner(pin).withTimeLimit(MAX_GIT_TIME_LIMIT_MS).timeLimitMs, MAX_GIT_TIME_LIMIT_MS);
  const invalid = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_GIT_TIME_LIMIT_MS + 1, Number.MAX_SAFE_INTEGER];
  for (const limit of invalid) assert.throws(() => new GitRunner(pin, limit), RangeError);
});

test('a time limit set later keeps the injected timer', async () => {
  const timer = new ManualGitTimer();
  const runner = new GitRunner(pin).withTimer(timer.timer).withTimeLimit(2_000);
  value(await runner.run({ args: ['--version'], cwd: GIT_NEUTRAL_DIRECTORY }));
  assert.deepEqual(timer.limits, [2_000]);
});

// A client that prints a ref listing; a short secret matches in both.
async function listingClient(listing: string): Promise<GitClientPin> {
  const path = join(scratch, 'listing');
  await writeFile(path, `#!/bin/sh\nprintf '%s' '${listing}'\n`);
  await chmod(path, 0o755);
  return { path, version: '' };
}

test('a parser reads the raw output, so a short secret cannot corrupt the data', async () => {
  const object = 'a'.repeat(8) + 'task' + 'b'.repeat(28);
  const ref = 'refs/heads/taskelith/x';
  const runner = new GitRunner(await listingClient(`${object}\t${ref}\n`));
  const short = credential('short', ['acme/project'], ['read-code'], 'task');
  const parse = (stdout: Uint8Array) => ok(new TextDecoder().decode(stdout));
  const command = { args: [], cwd: GIT_NEUTRAL_DIRECTORY, credential: short };
  assert.equal(value(await runner.runParsed(command, parse, 'unavailable', 'the listing')), `${object}\t${ref}\n`);
  const scrubbed = new TextDecoder().decode(value(await runner.run(command)).stdout);
  assert.equal(scrubbed.includes('task'), false, 'run still scrubs the output');
  const checked = new TextDecoder().decode(value(await runner.runChecked(command, 'unavailable', 'the listing')));
  assert.equal(checked.includes('task'), false, 'runChecked scrubs the output');
});

test('a failure message is scrubbed whole, its fixed text and exit code included', async () => {
  const path = join(scratch, 'failing');
  await writeFile(path, "#!/bin/sh\necho 'fatal: refused' >&2\nexit 128\n");
  await chmod(path, 0o755);
  const runner = new GitRunner({ path, version: '' });
  const command = { args: [], cwd: GIT_NEUTRAL_DIRECTORY, credential: credential('short', ['acme/project'], ['write-code'], '128') };
  const expected = `the push failed (exit ${REDACTED_VALUE}): fatal: refused`;
  assert.equal(failed(await runner.runChecked(command, 'unavailable', 'the push')).message, expected);
  assert.equal(failed(await runner.runParsed(command, (stdout) => ok(stdout), 'unavailable', 'the push')).message, expected);
});

test('a parser failure is scrubbed with its details, and a failed process is not parsed', async () => {
  const short = credential('short', ['acme/project'], ['read-code'], 'task');
  const command = { args: [], cwd: GIT_NEUTRAL_DIRECTORY, credential: short };
  const listing = new GitRunner(await listingClient('task\n'));
  const refuse = (stdout: Uint8Array) => {
    const output = new TextDecoder().decode(stdout).trim();
    return err(failure('internal', `cannot read ${output}`, { kept: 'yes', output }));
  };
  const refused = failed(await listing.runParsed(command, refuse, 'unavailable', 'the listing'));
  const details = { kept: 'yes', output: REDACTED_VALUE };
  assert.deepEqual([refused.code, refused.message, refused.details], ['internal', `cannot read ${REDACTED_VALUE}`, details]);
  let parsed = false;
  const outside = new GitRunner(pin).runParsed({ args: ['rev-parse', '--git-dir'], cwd: GIT_NEUTRAL_DIRECTORY }, () => ok((parsed = true)), 'internal', 'the lookup');
  assert.equal(failed(await outside).code, 'internal');
  assert.equal(parsed, false);
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  appliedProfileDigest,
  derivedWorkerProfile,
  NAMESPACE_CALLS,
  ProfileShapeError,
  serializeProfile,
  sha256,
  UPSTREAM_PATH,
  UPSTREAM_SHA256,
  WORKER_PATH,
  workerProfile,
  type SeccompProfile,
  type SeccompRule,
} from '../scripts/worker-seccomp-profile.ts';

const upstreamText = readFileSync(UPSTREAM_PATH, 'utf8');
const upstream = JSON.parse(upstreamText) as SeccompProfile;
const workerText = readFileSync(WORKER_PATH, 'utf8');
const worker = JSON.parse(workerText) as SeccompProfile;
const SYS_ADMIN = 'CAP_SYS_ADMIN';

function mentionsSysAdmin(rule: SeccompRule): boolean {
  return [rule.includes?.caps, rule.excludes?.caps].some((caps) => caps?.includes(SYS_ADMIN) ?? false);
}

function namespaceRules(profile: SeccompProfile): SeccompRule[] {
  return profile.syscalls.filter((rule) => rule.names.some((name) => NAMESPACE_CALLS.includes(name)));
}

test('the upstream copy is the pinned Docker default profile, byte for byte', () => {
  assert.equal(sha256(upstreamText), UPSTREAM_SHA256);
  assert.equal(serializeProfile(upstream), upstreamText);
});

test('the tracked worker profile is its derivation from the upstream copy', () => {
  assert.equal(workerText, derivedWorkerProfile(upstreamText), `${WORKER_PATH} is stale; run make worker-seccomp-profile`);
});

test('no namespace call depends on CAP_SYS_ADMIN in the worker profile', () => {
  assert.ok(namespaceRules(upstream).some(mentionsSysAdmin));
  assert.deepEqual(namespaceRules(worker).filter(mentionsSysAdmin), []);
  const allowed = worker.syscalls.filter((rule) => rule.action === 'SCMP_ACT_ALLOW' && rule.args === undefined);
  for (const call of ['clone', 'clone3', 'setns', 'unshare']) assert.ok(!allowed.some((rule) => rule.names.includes(call)), call);
  const clone3 = worker.syscalls.find((rule) => rule.names.includes('clone3'));
  assert.deepEqual([clone3?.action, clone3?.errnoRet], ['SCMP_ACT_ERRNO', 38]);
});

test('mount and the other CAP_SYS_ADMIN calls stay allowed', () => {
  const allowance = worker.syscalls.find((rule) => rule.includes?.caps?.[0] === SYS_ADMIN && rule.action === 'SCMP_ACT_ALLOW');
  for (const call of ['mount', 'umount2', 'bpf', 'sethostname']) assert.ok(allowance?.names.includes(call), call);
});

function withoutSysAdmin(filter: SeccompRule['excludes']): SeccompRule['excludes'] {
  const caps = filter?.caps?.filter((cap) => cap !== SYS_ADMIN) ?? [];
  const { caps: _, ...rest } = filter ?? {};
  const kept = caps.length > 0 ? { ...rest, caps } : rest;
  return Object.keys(kept).length > 0 ? kept : undefined;
}

test('only the namespace carve-out differs from upstream', () => {
  assert.deepEqual({ ...worker, syscalls: undefined }, { ...upstream, syscalls: undefined });
  assert.equal(worker.syscalls.length, upstream.syscalls.length);
  upstream.syscalls.forEach((original, index) => {
    const { names, excludes, ...rest } = worker.syscalls[index]!;
    const { names: originalNames, excludes: originalExcludes, ...originalRest } = original;
    assert.deepEqual(rest, originalRest, `rule ${index}`);
    const removed = originalNames.filter((name) => !names.includes(name));
    assert.deepEqual(names, originalNames.filter((name) => !removed.includes(name)), `rule ${index}`);
    assert.ok(removed.every((name) => NAMESPACE_CALLS.includes(name)), `rule ${index} lost ${removed.join()}`);
    const namespaceOnly = originalNames.every((name) => NAMESPACE_CALLS.includes(name));
    assert.deepEqual(excludes, namespaceOnly ? withoutSysAdmin(originalExcludes) : originalExcludes, `rule ${index}`);
  });
});

test('the derivation leaves its input unchanged', () => {
  const before = serializeProfile(upstream);
  workerProfile(upstream);
  assert.equal(serializeProfile(upstream), before);
});

test('a refreshed upstream copy that does not match the pin is refused', () => {
  assert.throws(() => derivedWorkerProfile(`${upstreamText} `), ProfileShapeError);
});

test('an upstream profile of another shape is refused', () => {
  const withoutAllowance = { ...upstream, syscalls: upstream.syscalls.filter((rule) => !rule.names.includes('unshare')) };
  assert.throws(() => workerProfile(withoutAllowance), /single CAP_SYS_ADMIN allowance/);
  const withoutClone3 = { ...upstream, syscalls: upstream.syscalls.filter((rule) => rule.names.join() !== 'clone3') };
  assert.throws(() => workerProfile(withoutClone3), /clone3 rule answering ENOSYS/);
});

function widened(rule: SeccompRule): SeccompProfile {
  return { ...upstream, syscalls: [...upstream.syscalls, rule] };
}

test('a refreshed upstream that allows a namespace call unconditionally is refused', () => {
  const unconditional = { names: ['clone'], action: 'SCMP_ACT_ALLOW', includes: { caps: ['CAP_NET_ADMIN'] } };
  assert.throws(() => workerProfile(widened(unconditional)), /still allows clone without an argument check/);
});

test('an empty argument check counts as none', () => {
  assert.throws(() => workerProfile(widened({ names: ['setns'], action: 'SCMP_ACT_ALLOW', args: [] })), /still allows setns/);
});

test('a rule that only logs a namespace call lets it through and is refused', () => {
  assert.throws(() => workerProfile(widened({ names: ['unshare'], action: 'SCMP_ACT_LOG' })), /still allows unshare/);
});

test('a namespace call allowed only with an argument check is kept', () => {
  const checked = { names: ['clone'], action: 'SCMP_ACT_ALLOW', args: [{ index: 0, value: 2114060288, op: 'SCMP_CMP_MASKED_EQ' }] };
  assert.doesNotThrow(() => workerProfile(widened(checked)));
});

// Docker's CLI sends the profile in compact form; inspect shows it so.
const compactWorker = JSON.stringify(worker);

function securityOpt(...options: string[]): string {
  return JSON.stringify(['apparmor=unconfined', 'no-new-privileges=true', ...options]);
}

test('the applied profile digest names the compact profile the container runs with', () => {
  assert.equal(appliedProfileDigest(securityOpt(`seccomp=${compactWorker}`), workerText), sha256(compactWorker));
});

test('a container without the worker profile has no applied profile digest', () => {
  assert.throws(() => appliedProfileDigest(securityOpt(), workerText), /runs with 0 seccomp options/);
  assert.throws(() => appliedProfileDigest('null', workerText), /runs with 0 seccomp options/);
  assert.throws(() => appliedProfileDigest(securityOpt('seccomp=unconfined'), workerText), /is not infra/);
  assert.throws(() => appliedProfileDigest(securityOpt(`seccomp=${JSON.stringify(upstream)}`), workerText), /is not infra/);
});

const CLI = join(process.cwd(), 'scripts/worker-seccomp-profile.ts');
const CLI_TIMEOUT_MILLISECONDS = 30_000;

// Runs the CLI from a foreign directory, so that it finds the repository
// through its own location.
function cli(...args: string[]): { status: number | null; stdout: string; stderr: string } {
  const directory = mkdtempSync(join(tmpdir(), 'taskelith-seccomp-cli-'));
  try {
    return spawnSync(process.execPath, ['--experimental-strip-types', CLI, ...args],
      { cwd: directory, encoding: 'utf8', timeout: CLI_TIMEOUT_MILLISECONDS });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('the applied command prints the digest of the worker profile a container runs with', () => {
  const run = cli('applied', securityOpt(`seccomp=${compactWorker}`));
  assert.deepEqual([run.status, run.stdout, run.stderr], [0, `${sha256(compactWorker)}\n`, '']);
});

test('the applied command fails for a container without the worker profile', () => {
  const run = cli('applied', securityOpt('seccomp=unconfined'));
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^worker-seccomp-profile: the container's seccomp profile is not infra/);
});

test('the CLI without arguments prints its usage and fails', () => {
  const run = cli();
  assert.equal(run.status, 1);
  assert.equal(run.stderr, 'worker-seccomp-profile: usage: worker-seccomp-profile.ts write [ROOT] | applied SECURITY_OPT_JSON\n');
});

test('the write command derives the worker profile under the root it is given', () => {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-seccomp-root-'));
  try {
    mkdirSync(join(root, dirname(UPSTREAM_PATH)), { recursive: true });
    cpSync(UPSTREAM_PATH, join(root, UPSTREAM_PATH));
    const run = cli('write', root);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(readFileSync(join(root, WORKER_PATH), 'utf8'), workerText);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

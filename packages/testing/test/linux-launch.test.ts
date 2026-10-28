import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { REQUIRE_LINUX_LAUNCH_VARIABLE, admitExecutionAccount, executionAccountOf, linuxLaunchFromEnvironment, type LinuxLaunch } from '@taskelith/testing';

const LAUNCH_ENVIRONMENT = {
  TASKELITH_CONTAINMENT_PARENT: '/sys/fs/cgroup/executions', TASKELITH_EXECUTION_UID: '2000', TASKELITH_EXECUTION_GID: '2001',
};

test('the Linux launch is read when all its variables are set on Linux', () => {
  assert.deepEqual(linuxLaunchFromEnvironment({ ...LAUNCH_ENVIRONMENT, OTHER: 'x' }, 'linux'), LAUNCH_ENVIRONMENT);
  assert.ok(Object.isFrozen(linuxLaunchFromEnvironment(LAUNCH_ENVIRONMENT, 'linux')));
});

test('no Linux launch, or one on another host, gives none', () => {
  assert.equal(linuxLaunchFromEnvironment({}, 'linux'), undefined);
  assert.equal(linuxLaunchFromEnvironment(LAUNCH_ENVIRONMENT, 'darwin'), undefined);
  assert.equal(linuxLaunchFromEnvironment({ TASKELITH_EXECUTION_UID: '2000' }, 'darwin'), undefined);
});

test('a partial Linux launch fails naming what is missing', () => {
  assert.throws(() => linuxLaunchFromEnvironment({ ...LAUNCH_ENVIRONMENT, TASKELITH_EXECUTION_GID: '' }, 'linux'),
    /^Error: a partial Linux launch: TASKELITH_EXECUTION_GID not set$/);
  assert.throws(() => linuxLaunchFromEnvironment({ TASKELITH_CONTAINMENT_PARENT: '/sys/fs/cgroup/executions' }, 'linux'),
    /^Error: a partial Linux launch: TASKELITH_EXECUTION_UID, TASKELITH_EXECUTION_GID not set$/);
});

test('a required Linux launch fails when it is absent or on another host', () => {
  const required = { [REQUIRE_LINUX_LAUNCH_VARIABLE]: '1' };
  assert.throws(() => linuxLaunchFromEnvironment(required, 'linux'),
    /^Error: TASKELITH_REQUIRE_LINUX_LAUNCH is set, but the Linux launch is not on linux: missing TASKELITH_CONTAINMENT_PARENT, TASKELITH_EXECUTION_UID, TASKELITH_EXECUTION_GID$/);
  assert.throws(() => linuxLaunchFromEnvironment({ ...required, ...LAUNCH_ENVIRONMENT }, 'darwin'), /is not on darwin: missing none$/);
  assert.deepEqual(linuxLaunchFromEnvironment({ ...required, ...LAUNCH_ENVIRONMENT }, 'linux'), LAUNCH_ENVIRONMENT);
});

test('the execution account is the numeric uid and gid of the launch', () => {
  assert.deepEqual(executionAccountOf(LAUNCH_ENVIRONMENT), { uid: 2000, gid: 2001 });
});

test('admission opens the base for passage and hands the account its files', () => {
  const base = mkdtempSync(join(tmpdir(), 'taskelith-linux-launch-'));
  try {
    const own: LinuxLaunch = { ...LAUNCH_ENVIRONMENT, TASKELITH_EXECUTION_UID: String(process.getuid!()), TASKELITH_EXECUTION_GID: String(process.getgid!()) };
    const spawns = join(base, 'spawns');
    admitExecutionAccount(base, own, [spawns]);
    assert.equal(statSync(base).mode & 0o777, 0o711);
    assert.equal(readFileSync(spawns, 'utf8'), '');
    assert.deepEqual([statSync(spawns).uid, statSync(spawns).gid], [process.getuid!(), process.getgid!()]);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('admission without writable files only opens the base for passage', () => {
  const base = mkdtempSync(join(tmpdir(), 'taskelith-linux-launch-'));
  try {
    admitExecutionAccount(base, LAUNCH_ENVIRONMENT);
    assert.equal(statSync(base).mode & 0o777, 0o711);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

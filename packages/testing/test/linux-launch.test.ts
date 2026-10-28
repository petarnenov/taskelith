import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { admitExecutionAccount, executionAccountOf, linuxLaunchFromEnvironment, type LinuxLaunch } from '@taskelith/testing';

const LAUNCH_ENVIRONMENT = {
  TASKELITH_CONTAINMENT_PARENT: '/sys/fs/cgroup/executions', TASKELITH_EXECUTION_UID: '2000', TASKELITH_EXECUTION_GID: '2001',
};

test('the Linux launch is read when all its variables are set on Linux', () => {
  assert.deepEqual(linuxLaunchFromEnvironment({ ...LAUNCH_ENVIRONMENT, OTHER: 'x' }, 'linux'), LAUNCH_ENVIRONMENT);
  assert.ok(Object.isFrozen(linuxLaunchFromEnvironment(LAUNCH_ENVIRONMENT, 'linux')));
});

test('a partial Linux launch or another host gives none', () => {
  assert.equal(linuxLaunchFromEnvironment({ ...LAUNCH_ENVIRONMENT, TASKELITH_EXECUTION_GID: '' }, 'linux'), undefined);
  assert.equal(linuxLaunchFromEnvironment({ TASKELITH_CONTAINMENT_PARENT: '/sys/fs/cgroup/executions' }, 'linux'), undefined);
  assert.equal(linuxLaunchFromEnvironment(LAUNCH_ENVIRONMENT, 'darwin'), undefined);
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

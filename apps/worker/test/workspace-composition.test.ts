import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { GitWorkspaces, LinuxReclaimHost, ProcessGroupReclaimHost, verifyGitClient, type VerifiedGitClient } from '@taskelith/git-workspace';
import type { Result } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';
import { CLONE_UMASK, composeWorkspace, reclaimHostFor, type LaunchSettings, type WorkerSettings, type WorkspaceHost } from '@taskelith/worker';
import { GIT_CLIENT_PINS, type GitClientPin } from '@taskelith/workspace';

const HOST_GIT = '/usr/bin/git';
const HOST_GIT_VERSION = execFileSync(HOST_GIT, ['--version'], { encoding: 'utf8' }).trim();

const SETTINGS: WorkerSettings = {
  dataRoot: '/var/lib/taskelith', controlPlaneUrl: new URL('https://control-plane/'), natsUrl: new URL('nats://broker:4222'),
  host: { platform: 'linux', architecture: 'x64', hostname: 'build-1' },
  capacity: { slots: 1, cpuMillicores: 4000, memoryMebibytes: 7680, controls: [] },
};
const COMMAND = { executable: '/bin/true', arguments: [] };
const LINUX_LAUNCH: LaunchSettings = { command: COMMAND, executionAccount: { uid: 10003, gid: 10003 } };
const LINUX: WorkerSettings = { ...SETTINGS, containmentParent: '/sys/fs/cgroup/executions', launch: LINUX_LAUNCH };
const DARWIN: WorkerSettings = { ...SETTINGS, host: { ...SETTINGS.host, platform: 'darwin' }, launch: { command: COMMAND } };

// Records what the composition asked of the host; the gate runs the
// host's own Git against a pin of its real version, or of another one.
class FakeWorkspaceHost implements WorkspaceHost {
  hardlinks: string | Error = '1\n';
  clientMatches = true;
  reads = 0;
  readonly umasks: number[] = [];
  readonly pins: GitClientPin[] = [];

  readProtectedHardlinks(): string {
    this.reads += 1;
    if (this.hardlinks instanceof Error) throw this.hardlinks;
    return this.hardlinks;
  }

  setUmask(mask: number): void {
    this.umasks.push(mask);
  }

  verifyGitClient(pin: GitClientPin): Promise<Result<VerifiedGitClient>> {
    this.pins.push(pin);
    return verifyGitClient({ path: HOST_GIT, version: this.clientMatches ? HOST_GIT_VERSION : 'git version 0.0.0' });
  }
}

test('a Linux worker without a launch command composes no workspace and runs no hard-link check or Git gate', async () => {
  const host = new FakeWorkspaceHost();
  const parent = { ...SETTINGS, containmentParent: '/sys/fs/cgroup/executions' };
  assert.equal(value(await composeWorkspace(parent, host)), undefined);
  assert.deepEqual([host.reads, host.pins, host.umasks], [0, [], []]);
});

test('a Linux worker with an execution account refuses to start unless fs.protected_hardlinks is 1', async () => {
  for (const setting of ['0\n', '2\n', '', '1 \n', '11\n', new Error('EACCES: permission denied')]) {
    const host = new FakeWorkspaceHost();
    host.hardlinks = setting;
    const refused = failed(await composeWorkspace(LINUX, host));
    assert.deepEqual([refused.code, refused.details.reason], ['precondition-failed', 'hardlinks-unprotected'], String(setting));
    assert.match(refused.message, /fs\.protected_hardlinks/);
    assert.deepEqual([host.pins, host.umasks], [[], []], 'nothing else runs');
  }
  for (const setting of ['1', '1\n']) {
    const host = new FakeWorkspaceHost();
    host.hardlinks = setting;
    assert.ok(value(await composeWorkspace(LINUX, host)) instanceof GitWorkspaces, JSON.stringify(setting));
  }
});

test('a Git client that is not the pinned one fails the composition and changes no umask', async () => {
  const host = new FakeWorkspaceHost();
  host.clientMatches = false;
  const refused = failed(await composeWorkspace(LINUX, host));
  assert.deepEqual([refused.code, refused.details.reason], ['precondition-failed', 'git-client-mismatch']);
  assert.deepEqual(host.umasks, []);
});

test('a Linux composition checks the hard links, verifies the Linux pin, and sets the clone umask', async () => {
  const host = new FakeWorkspaceHost();
  assert.ok(value(await composeWorkspace(LINUX, host)) instanceof GitWorkspaces);
  assert.deepEqual([host.reads, host.pins, host.umasks], [1, [GIT_CLIENT_PINS.linux], [CLONE_UMASK]]);
  assert.equal(CLONE_UMASK, 0o007);
  const reclaimHost = reclaimHostFor(LINUX);
  assert.ok(reclaimHost instanceof LinuxReclaimHost);
  assert.deepEqual(reclaimHost.executionAccount, { uid: 10003, gid: 10003 });
});

test('a macOS composition reads no hard-link setting, keeps its umask, and uses Apple\'s pin and a process group', async () => {
  const host = new FakeWorkspaceHost();
  assert.ok(value(await composeWorkspace(DARWIN, host)) instanceof GitWorkspaces);
  assert.deepEqual([host.reads, host.pins, host.umasks], [0, [GIT_CLIENT_PINS.darwin], []]);
  const reclaimHost = reclaimHostFor(DARWIN);
  assert.ok(reclaimHost instanceof ProcessGroupReclaimHost);
  assert.equal(reclaimHost.executionAccount, null);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePsListing } from './g2-scenarios/leftover-processes.ts';
import { cancelSignalOf, isContainmentOf, launchHostOf, macosLaunchFromEnvironment } from './g2-scenarios/scenario-launch.ts';

// The launch hosts of the G2 races and their supervisor guards.
const PARENT = '/sys/fs/cgroup/executions/taskelith-g2-abc-cancel-after-w4';

test('a containment directly below the worker parent is its own', () => {
  assert.equal(isContainmentOf(PARENT, `${PARENT}/0b1c2d3e-execution`), true);
});

test('the bare parent, the root, a deeper cgroup, or another worker are not', () => {
  assert.equal(isContainmentOf(PARENT, PARENT), false);
  assert.equal(isContainmentOf(PARENT, '/sys/fs/cgroup/'), false);
  assert.equal(isContainmentOf(PARENT, `${PARENT}/execution/nested`), false);
  assert.equal(isContainmentOf(PARENT, '/sys/fs/cgroup/executions/taskelith-g2-abc-other/execution'), false);
  assert.equal(isContainmentOf(PARENT, `${PARENT}-other/execution`), false);
});

const LINUX_LAUNCH = { TASKELITH_CONTAINMENT_PARENT: '/sys/fs/cgroup/executions', TASKELITH_EXECUTION_UID: '10003', TASKELITH_EXECUTION_GID: '10003' };

test('the macOS launch is asked for only by its variable set to 1', () => {
  assert.equal(macosLaunchFromEnvironment({}, 'darwin'), false);
  assert.equal(macosLaunchFromEnvironment({ TASKELITH_MACOS_SCENARIOS: '0' }, 'darwin'), false);
  assert.equal(macosLaunchFromEnvironment({ TASKELITH_MACOS_SCENARIOS: '1' }, 'darwin'), true);
});

test('the macOS launch asked for off macOS throws, naming the platform', () => {
  assert.throws(() => macosLaunchFromEnvironment({ TASKELITH_MACOS_SCENARIOS: '1' }, 'linux'), /needs macOS, not linux/);
});

test('each launch host composes its own supervisor and cancel signal', () => {
  assert.equal(launchHostOf(LINUX_LAUNCH, false), 'cgroup-supervisor');
  assert.equal(launchHostOf(undefined, true), 'macos-supervisor');
  assert.equal(launchHostOf(undefined, false), 'process-group');
  assert.equal(cancelSignalOf('cgroup-supervisor'), 'SIGKILL');
  assert.equal(cancelSignalOf('macos-supervisor'), 'SIGTERM');
  assert.equal(cancelSignalOf('process-group'), 'SIGTERM');
});

test('a ps listing gives each process its whole command line', () => {
  const listing = '    1 /sbin/launchd\n81930 node /dist/supervisor-main.js launch /tmp/a b/executions/e\n\n';
  assert.deepEqual(parsePsListing(listing), [
    { pid: 1, commandLine: '/sbin/launchd' },
    { pid: 81930, commandLine: 'node /dist/supervisor-main.js launch /tmp/a b/executions/e' },
  ]);
});

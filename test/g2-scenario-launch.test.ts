import assert from 'node:assert/strict';
import test from 'node:test';
import { isContainmentOf } from './g2-scenarios/scenario-launch.ts';

// The containment guard of the G2 races under the cgroup supervisor.
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

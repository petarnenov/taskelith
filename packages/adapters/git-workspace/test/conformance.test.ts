import assert from 'node:assert/strict';
import test from 'node:test';
import { WORKSPACE_CONFORMANCE } from '@taskelith/workspace';
import { createGitFixture } from './git-fixture.ts';

// Cases that need the hand-off, each with its reason; the adapter runs
// every other case of the suite.
const HAND_OFF = 'needs handOff and reclaim, sub-change 16d';
const LATER: Readonly<Record<string, string>> = {
  'reads the handed-off workspaces from their records, also after a restart': HAND_OFF,
  'hands the checkout to the execution and takes it back without outside links': HAND_OFF,
  'holds one handed-off workspace at a time where executions share a separate account': HAND_OFF,
  'lets one of two concurrent hand-offs through where executions share a separate account': HAND_OFF,
  'writes the repository configuration anew, so settings the agent planted never act': HAND_OFF,
  'reads the remote head of a handed-off workspace outside every repository': HAND_OFF,
};

test('every deferred case names a case of the suite', () => {
  const names = new Set(WORKSPACE_CONFORMANCE.map(({ name }) => name));
  assert.deepEqual(Object.keys(LATER).filter((name) => !names.has(name)), []);
  assert.equal(Object.keys(LATER).length, 6);
});

for (const conformance of WORKSPACE_CONFORMANCE) {
  const skip = LATER[conformance.name] ?? false;
  test(`the Git adapter: ${conformance.name}`, { skip }, async () => {
    const git = await createGitFixture();
    try {
      assert.deepEqual(await conformance.check(git.fixture), []);
    } finally {
      await git.dispose();
    }
  });
}

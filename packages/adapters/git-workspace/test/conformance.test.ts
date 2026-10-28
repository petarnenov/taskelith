import assert from 'node:assert/strict';
import test from 'node:test';
import { WORKSPACE_CONFORMANCE } from '@taskelith/workspace';
import { createGitFixture } from './git-fixture.ts';

// Cases that need an operation of a later sub-change, each with its
// reason; 16b runs every other case against the Git adapter.
const REMOTE = 'needs push or readRemoteHead, sub-change 16c';
const HAND_OFF = 'needs handOff and reclaim, sub-change 16d';
const LATER: Readonly<Record<string, string>> = {
  'opens a read-only workspace at a given head, detached': REMOTE,
  'refuses an out-of-scope credential before any remote call and never stores one': REMOTE,
  'reports a change staged and then reverted in the working tree, and keeps that workspace': REMOTE,
  'pushes a clean task branch fast-forward at the remote head the port reports': REMOTE,
  'refuses a push whose remote task branch moved, and leaves the remote where it is': REMOTE,
  'refuses a push that does not descend from the remote head, and leaves the remote where it is': REMOTE,
  'snapshots exactly the clean head tree, in bytes that depend on the tree alone': REMOTE,
  'refuses Git work on a checkout whose Git directory holds a link, is gone, or is nested': REMOTE,
  'runs Git in an environment it builds, with no credential in an argument': REMOTE,
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

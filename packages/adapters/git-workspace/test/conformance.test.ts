import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConformanceCase } from '@taskelith/sdlc';
import { WORKSPACE_CONFORMANCE, type WorkspaceFixture } from '@taskelith/workspace';
import { createGitFixture, simulatedSeparateAccount, type GitFixtureOptions } from './git-fixture.ts';

async function conforms(conformance: ConformanceCase<WorkspaceFixture>, options: GitFixtureOptions = {}): Promise<void> {
  const git = await createGitFixture(options);
  try {
    assert.deepEqual(await conformance.check(git.fixture), []);
  } finally {
    await git.dispose();
  }
}

for (const conformance of WORKSPACE_CONFORMANCE) {
  test(`the Git adapter: ${conformance.name}`, () => conforms(conformance));
}

// The cases that hand a workspace off, again with an execution account,
// as the worker image composes the adapter (contract section 3).
const HAND_OFF_CASES = WORKSPACE_CONFORMANCE.filter(({ name }) => /hand/i.test(name));

test('the hand-off cases include both of a separate account', () => {
  assert.equal(HAND_OFF_CASES.filter(({ name }) => name.endsWith('share a separate account')).length, 2);
});

for (const conformance of HAND_OFF_CASES) {
  test(`the Git adapter with an execution account: ${conformance.name}`, () =>
    conforms(conformance, { reclaimHost: simulatedSeparateAccount() }));
}

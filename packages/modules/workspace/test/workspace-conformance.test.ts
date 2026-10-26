import assert from 'node:assert/strict';
import test from 'node:test';
import { WORKSPACE_CONFORMANCE } from '@taskelith/workspace';
import { createFixture, type DoubleDefects } from './temp-dir-workspaces.ts';

for (const conformance of WORKSPACE_CONFORMANCE) {
  test(`a conforming workspace provider: ${conformance.name}`, async () => {
    const { fixture, dispose } = await createFixture();
    try {
      assert.deepEqual(await conformance.check(fixture), []);
    } finally {
      await dispose();
    }
  });
}

async function failingCases(defects: DoubleDefects): Promise<string[]> {
  const failing: string[] = [];
  for (const conformance of WORKSPACE_CONFORMANCE) {
    const { fixture, dispose } = await createFixture(defects);
    try {
      if ((await conformance.check(fixture)).length > 0) failing.push(conformance.name);
    } finally {
      await dispose();
    }
  }
  return failing;
}

test('a provider that stores the credential in the workspace fails the suite', async () => {
  assert.deepEqual(await failingCases({ storesSecret: true }), ['uses a run credential only within its scope and never stores it']);
});

test('a provider that misses untracked files fails the suite', async () => {
  assert.deepEqual(await failingCases({ ignoresUntracked: true }), [
    'reports modified and untracked files, ignores ignored ones, and is clean after a commit',
    'pushes a clean task branch fast-forward at the expected remote head only',
    'snapshots only the clean head tree, in bytes that depend on the tree alone',
  ]);
});

test('a provider whose removal reaches beyond its workspace fails the suite', async () => {
  assert.deepEqual(await failingCases({ removesWorkspacesRoot: true }), ['removes only its own workspace and never a control record']);
});

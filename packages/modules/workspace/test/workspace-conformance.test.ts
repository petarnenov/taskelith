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

const PREPARE = 'prepares a task branch workspace at the base head';
const REJECT = 'rejects unsafe names, foreign or mismatched heads, and missing sources, leaving nothing';
const CREDENTIAL = 'refuses an out-of-scope credential before any remote call and never stores one';
const DIRTY = 'reports modified and untracked files, ignores ignored ones, and is clean after a commit';
const STAGED = 'reports a change staged and then reverted in the working tree, and keeps that workspace';
const PUSH = 'pushes a clean task branch fast-forward at the remote head the port reports';
const SNAPSHOT = 'snapshots exactly the clean head tree, in bytes that depend on the tree alone';
const REMOVE = 'removes only its own clean workspace, keeps a dirty one, and never a control record';
const SWEEP = 'sweeps interrupted prepares and removals without following links, across a restart';
const HAND_OFF = 'hands the checkout to the execution and takes it back without outside links';
const GIT_LINK = 'refuses Git work on a checkout whose Git directory holds a link';

// Each defect of the double breaks the guarantees of the named cases.
const DEFECTS: readonly [string, DoubleDefects, readonly string[]][] = [
  ['stores the credential in the workspace', { storesSecret: true }, [CREDENTIAL]],
  ['calls the remote before checking the scope', { callsRemoteBeforeScope: true }, [CREDENTIAL]],
  ['calls the remote before the scope check of a prepare only', { callsRemoteBeforeScopeInPrepare: true }, [CREDENTIAL]],
  ['returns a stale tree with a snapshot', { snapshotsStaleTree: true }, [SNAPSHOT]],
  ['removes a dirty workspace', { removesDirty: true }, [STAGED, REMOVE]],
  ['ignores the index', { ignoresIndex: true }, [STAGED]],
  ['corrupts binary content in the snapshot', { corruptsBinary: true }, [SNAPSHOT]],
  ['misses untracked files', { ignoresUntracked: true }, [PREPARE, DIRTY, PUSH, SNAPSHOT, REMOVE]],
  ['checks the task only for a task branch', { checksTaskOnlyOnBranch: true }, [REJECT]],
  ['accepts a tree that is not the commit tree', { acceptsMismatchedTree: true }, [REJECT]],
  ['puts the commit into the snapshot', { snapshotsCommit: true }, [SNAPSHOT]],
  ['loses modes and link targets in the snapshot', { snapshotsWithoutMetadata: true }, [SNAPSHOT]],
  ['removes beyond its workspace', { removesWorkspacesRoot: true }, [REMOVE]],
  ['follows links when it sweeps', { sweepFollowsLinks: true }, [SWEEP]],
  ['runs Git on a handed-off checkout', { ignoresHandOff: true }, [HAND_OFF]],
  ['keeps links from outside when it reclaims', { keepsOutsideLinks: true }, [HAND_OFF]],
  ['follows a link in the Git directory', { followsGitLinks: true }, [GIT_LINK]],
];

for (const [name, defects, failing] of DEFECTS) {
  test(`a provider that ${name} fails the suite`, async () => {
    assert.deepEqual(await failingCases(defects), failing);
  });
}

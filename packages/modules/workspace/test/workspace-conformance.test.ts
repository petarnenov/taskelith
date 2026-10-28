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
const CONTINUE = 'continues the task branch when the remote has it';
const REJECT = 'rejects foreign or mismatched heads and missing sources, leaving nothing';
const DIGEST = 'names workspaces with SHA-256 of the identifier in lowercase hexadecimal';
const NAMES = 'derives distinct workspace names and task branches from any identifiers';
const CREDENTIAL = 'refuses an out-of-scope credential before any remote call and never stores one';
const DIRTY = 'reports modified and untracked files, ignores ignored ones, and is clean after a commit';
const STAGED = 'reports a change staged and then reverted in the working tree, and keeps that workspace';
const PUSH = 'pushes a clean task branch fast-forward at the remote head the port reports';
const REMOTE_MOVED = 'refuses a push whose remote task branch moved, and leaves the remote where it is';
const NOT_FAST_FORWARD = 'refuses a push that does not descend from the remote head, and leaves the remote where it is';
const SNAPSHOT = 'snapshots exactly the clean head tree, in bytes that depend on the tree alone';
const GITLINK = 'refuses to snapshot a tree that holds a gitlink';
const REMOVE = 'removes only its own clean workspace, keeps a dirty one, and never a control record';
const SWEEP = 'sweeps interrupted prepares and removals without following links, across a restart';
const HANDED_OFF = 'reads the handed-off workspaces from their records, also after a restart';
const HAND_OFF = 'hands the checkout to the execution and takes it back without outside links';
const GIT_LINK = 'refuses Git work on a checkout whose Git directory holds a link, is gone, or is nested';
const ONE_HAND_OFF = 'holds one handed-off workspace at a time where executions share a separate account';
const CONCURRENT_HAND_OFF = 'lets one of two concurrent hand-offs through where executions share a separate account';
const GIT_PROCESSES = 'runs Git in an environment it builds, with no secret in an argument';
const PLANTED_SETTINGS = 'writes the repository configuration anew, so settings the agent planted never act';

const EVERY_CASE = WORKSPACE_CONFORMANCE.map(({ name }) => name);

// Each defect of the double breaks the guarantees of the named cases.
const DEFECTS: readonly [string, DoubleDefects, readonly string[]][] = [
  ['stores the credential in the workspace', { storesSecret: true }, [CREDENTIAL, REMOTE_MOVED, NOT_FAST_FORWARD, GIT_PROCESSES, PLANTED_SETTINGS]],
  ['calls the remote before checking the scope', { callsRemoteBeforeScope: true }, [CREDENTIAL]],
  ['calls the remote before the scope check of a prepare only', { callsRemoteBeforeScopeInPrepare: true }, [CREDENTIAL]],
  ['returns a stale tree with a snapshot', { snapshotsStaleTree: true }, [SNAPSHOT]],
  ['removes a dirty workspace', { removesDirty: true }, [STAGED, REMOVE]],
  ['ignores the index', { ignoresIndex: true }, [STAGED]],
  ['corrupts binary content in the snapshot', { corruptsBinary: true }, [SNAPSHOT]],
  ['misses untracked files', { ignoresUntracked: true }, [PREPARE, DIRTY, PUSH, SNAPSHOT, REMOVE]],
  ['rejects identifiers outside the former safe form', { rejectsUnsafeNames: true }, [NAMES]],
  ['names the workspace directory by an encoding of the attempt identifier', { namesDirectoryByEncoding: true }, [NAMES]],
  ['removes a digest-only workspace under a name with a dash', { removesDigestOnlyNameWithDash: true }, [NAMES]],
  ['digests identifiers with SHA-1', { digestsWithSha1: true }, [DIGEST]],
  ['digests the Latin-1 bytes of identifiers', { digestsLatin1Bytes: true }, [DIGEST]],
  ['names the task branch by the raw task identifier', { namesBranchByRawTaskId: true }, [PREPARE, CONTINUE, NAMES, PUSH, REMOTE_MOVED, NOT_FAST_FORWARD, PLANTED_SETTINGS]],
  ['accepts a tree that is not the commit tree', { acceptsMismatchedTree: true }, [REJECT]],
  ['puts the commit into the snapshot', { snapshotsCommit: true }, [SNAPSHOT]],
  ['loses modes and link targets in the snapshot', { snapshotsWithoutMetadata: true }, [SNAPSHOT]],
  ['removes beyond its workspace', { removesWorkspacesRoot: true }, [NAMES, REMOVE]],
  ['follows links when it sweeps', { sweepFollowsLinks: true }, [SWEEP]],
  ['runs Git on a handed-off checkout', { ignoresHandOff: true }, [HAND_OFF]],
  ['keeps links from outside when it reclaims', { keepsOutsideLinks: true }, [HAND_OFF]],
  ['follows a link in the Git directory', { followsGitLinks: true }, [GIT_LINK]],
  ['hands off a second workspace', { handsOffBeyondOne: true }, [ONE_HAND_OFF, CONCURRENT_HAND_OFF]],
  ['races two concurrent hand-offs', { racesHandOff: true }, [CONCURRENT_HAND_OFF]],
  ['pushes over a moved remote branch', { ignoresLease: true }, [PUSH, REMOTE_MOVED]],
  ['pushes a head that does not descend from the leased one', { ignoresAncestry: true }, [PUSH, NOT_FAST_FORWARD]],
  ['pushes with a lease that names no expected head', { pushesWithBareLease: true }, [REMOTE_MOVED, NOT_FAST_FORWARD, PLANTED_SETTINGS]],
  ['forgets its hand-offs across a restart', { forgetsHandOffsOnRestart: true }, [HANDED_OFF]],
  ['passes the secret in a Git argument', { passesSecretInArguments: true }, [GIT_PROCESSES]],
  ['runs Git in the inherited environment', { inheritsEnvironment: true }, [GIT_PROCESSES]],
  ['keeps the repository settings the agent planted', { keepsPlantedSettings: true }, [PLANTED_SETTINGS]],
  ['snapshots a tree that holds a gitlink', { snapshotsGitlink: true }, [GITLINK]],
  ['clones from a remote that is not HTTPS', { acceptsInsecureRemote: true }, [REJECT]],
  ['cannot reach the remote for any prepare', { refusesEveryPrepare: true }, EVERY_CASE.filter((name) => name !== DIGEST)],
];

for (const [name, defects, failing] of DEFECTS) {
  test(`a provider that ${name} fails the suite`, async () => {
    assert.deepEqual(await failingCases(defects), failing);
  });
}

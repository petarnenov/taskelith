import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIdentifier } from '@taskelith/kernel';
import type { AttemptId } from '@taskelith/execution';
import type { TaskId } from '@taskelith/sdlc';
import {
  DIRTY_REASONS,
  HEAD_SNAPSHOT_EVIDENCE_KIND,
  TASK_BRANCH_PREFIX,
  WORKSPACE_FAILURE_REASONS,
  WORKSPACE_KINDS,
  WORKSPACE_LAYOUT,
  WORKSPACE_MODES,
  checkCredentialScope,
  cleanHead,
  isSameCodeHead,
  parseCodeHeadIdentity,
  taskBranchName,
  workspaceDirectoryName,
  type CodeHeadIdentity,
  type RepositoryId,
  type WorkspaceCredential,
} from '@taskelith/workspace';

// The values the workspace contract fixes; a change here is a contract
// change and needs the contract updated with it.
const CONTRACT_VALUES = [
  ['WORKSPACE_KINDS', WORKSPACE_KINDS, ['task-branch', 'at-head']],
  ['DIRTY_REASONS', DIRTY_REASONS, ['modified', 'untracked', 'operation-in-progress', 'off-branch']],
  [
    'WORKSPACE_FAILURE_REASONS',
    WORKSPACE_FAILURE_REASONS,
    ['unsafe-name', 'head-mismatch', 'workspace-dirty', 'credential-out-of-scope', 'remote-moved', 'not-fast-forward', 'read-only-workspace',
      'workspace-handed-off', 'unsafe-checkout'],
  ],
] as const;

for (const [name, actual, expected] of CONTRACT_VALUES) {
  test(`${name} holds the contract's values, frozen`, () => {
    assert.deepEqual(actual, expected);
    assert.ok(Object.isFrozen(actual));
  });
}

test('the layout, branch prefix, and evidence kind hold the contract values', () => {
  assert.deepEqual(WORKSPACE_LAYOUT, {
    root: 'worker/workspaces', checkout: 'checkout', metadata: 'workspace', handOffRecord: 'handed-off',
    stagingPrefix: '.staging-', removingPrefix: '.removing-',
  });
  assert.ok(Object.isFrozen(WORKSPACE_LAYOUT));
  assert.deepEqual(WORKSPACE_MODES, {
    attempt: 0o710, checkoutReclaimed: 0o2700, checkoutHandedOff: 0o2770, metadata: 0o600, handOffRecord: 0o600,
  });
  assert.ok(Object.isFrozen(WORKSPACE_MODES));
  assert.equal(TASK_BRANCH_PREFIX, 'taskelith/');
  assert.equal(HEAD_SNAPSHOT_EVIDENCE_KIND, 'code-head-snapshot');
});

const SHA1 = 'a'.repeat(40);
const OTHER_SHA1 = 'b'.repeat(40);
const SHA256 = 'c'.repeat(64);

function head(commit = SHA1, tree = OTHER_SHA1): CodeHeadIdentity {
  const parsed = parseCodeHeadIdentity({ repository: 'acme/project', commit, tree });
  assert.ok(parsed.ok);
  return parsed.value;
}

test('a code head parses with SHA-1 or SHA-256 names into a frozen record', () => {
  assert.deepEqual(head(), { repository: 'acme/project', commit: SHA1, tree: OTHER_SHA1 });
  assert.ok(Object.isFrozen(head()));
  assert.ok(parseCodeHeadIdentity({ repository: 'acme/project', commit: SHA256, tree: SHA256 }).ok);
});

const INVALID_HEADS: readonly [string, string, string, string, string][] = [
  ['an empty repository', '', SHA1, SHA1, 'repository'],
  ['an abbreviated commit', 'acme/project', 'abc123', SHA1, 'commit'],
  ['an uppercase commit', 'acme/project', SHA1.toUpperCase(), SHA1, 'commit'],
  ['a malformed tree', 'acme/project', SHA1, 'tree', 'tree'],
  ['mixed object formats', 'acme/project', SHA1, SHA256, 'tree'],
];

for (const [name, repository, commit, tree, field] of INVALID_HEADS) {
  test(`a code head with ${name} is invalid`, () => {
    const parsed = parseCodeHeadIdentity({ repository, commit, tree });
    assert.ok(!parsed.ok);
    assert.equal(parsed.error.code, 'invalid');
    assert.equal(parsed.error.details.field, field);
  });
}

test('a code head is the same only when repository, commit, and tree match', () => {
  assert.ok(isSameCodeHead(head(), head()));
  assert.ok(!isSameCodeHead(head(), head(SHA256.slice(0, 40))));
  assert.ok(!isSameCodeHead(head(), head(SHA1, SHA1)));
  assert.ok(!isSameCodeHead(head(), { ...head(), repository: 'acme/other' as RepositoryId }));
});

function identifier<Kind extends string>(kind: Kind, text: string) {
  const parsed = parseIdentifier(kind, text);
  assert.ok(parsed.ok);
  return parsed.value;
}

test('names are single safe segments, and a task branch carries the prefix', () => {
  assert.deepEqual(workspaceDirectoryName(identifier('AttemptId', 'attempt_1-a') as AttemptId), { ok: true, value: 'attempt_1-a' });
  assert.deepEqual(taskBranchName(identifier('TaskId', 'task-1') as TaskId), { ok: true, value: 'taskelith/task-1' });
  for (const text of ['..', '.hidden', 'a/b', '-lead', 'a.lock', 'a:b']) {
    const named = workspaceDirectoryName(identifier('AttemptId', text) as AttemptId);
    assert.ok(!named.ok);
    assert.deepEqual([named.error.code, named.error.details.reason], ['invalid', 'unsafe-name']);
    assert.ok(!taskBranchName(identifier('TaskId', text) as TaskId).ok);
  }
});

test('only a clean status yields a head for head-bound evidence', () => {
  assert.deepEqual(cleanHead({ head: head(), branch: null, dirtyReasons: [] }), { ok: true, value: head() });
  const dirty = cleanHead({ head: head(), branch: 'taskelith/task-1', dirtyReasons: ['modified', 'untracked'] });
  assert.ok(!dirty.ok);
  assert.deepEqual([dirty.error.code, dirty.error.details.reason], ['precondition-failed', 'workspace-dirty']);
  assert.match(dirty.error.message, /modified, untracked/);
});

test('a credential is in scope only with the repository and the access', () => {
  const repository = identifier('RepositoryId', 'acme/project') as RepositoryId;
  const credential: WorkspaceCredential = { credentialId: 'c-1', secret: 's', repositories: [repository], permissions: ['read-code'] };
  assert.ok(checkCredentialScope(credential, repository, 'read-code').ok);
  const write = checkCredentialScope(credential, repository, 'write-code');
  assert.ok(!write.ok);
  assert.deepEqual([write.error.code, write.error.details.reason], ['forbidden', 'credential-out-of-scope']);
  assert.ok(!checkCredentialScope(credential, identifier('RepositoryId', 'acme/other') as RepositoryId, 'read-code').ok);
});

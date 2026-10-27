import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
  WORKSPACE_NAME_RULES,
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
    ['head-mismatch', 'workspace-dirty', 'credential-out-of-scope', 'remote-moved', 'not-fast-forward', 'read-only-workspace',
      'workspace-handed-off', 'other-workspace-handed-off', 'reclaim-failed', 'unsafe-checkout'],
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
  assert.deepEqual(WORKSPACE_NAME_RULES, { prefixMaxLength: 40, digestHexLength: 32 });
  assert.ok(Object.isFrozen(WORKSPACE_NAME_RULES));
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

const attemptOf = (text: string) => workspaceDirectoryName(text as AttemptId);
const branchOf = (text: string) => taskBranchName(text as TaskId);
const digestOf = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 32);
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const NAMED = ['task-1', 'feature/login', 'v1.2', '..', '.hidden', '-lead', 'a.lock', 'a:b', '@', 'x'.repeat(128), 'café/ü'];

test('a name is the readable prefix of the identifier and its digest', () => {
  assert.equal(attemptOf('attempt_1-a'), `attempt_1-a-${digestOf('attempt_1-a')}`);
  assert.equal(branchOf('task-1'), `taskelith/task-1-${digestOf('task-1')}`);
  assert.equal(branchOf('feature/login'), `taskelith/feature_login-${digestOf('feature/login')}`);
  assert.equal(attemptOf('v1.2'), `v1_2-${digestOf('v1.2')}`);
  assert.equal(attemptOf('..'), digestOf('..'));
  assert.equal(attemptOf('-lead'), `lead-${digestOf('-lead')}`);
  assert.equal(attemptOf('café/ü'), `caf___-${digestOf('café/ü')}`);
  assert.equal(attemptOf('x'.repeat(128)), `${'x'.repeat(40)}-${digestOf('x'.repeat(128))}`);
});

test('the digest is SHA-256 across the padding and block boundaries', () => {
  for (const length of [1, 55, 56, 63, 64, 65, 119, 120, 128]) {
    const text = 'y'.repeat(length);
    assert.equal(attemptOf(text), `${text.slice(0, 40)}-${digestOf(text)}`, `length ${length}`);
  }
});

test('any identifier gives a safe path segment of at most 73 characters', () => {
  for (const text of NAMED) {
    const name = attemptOf(text);
    assert.match(name, SAFE_NAME, text);
    assert.ok(name.length <= 73, text);
    assert.equal(attemptOf(text), name, `${text} is deterministic`);
  }
});

test('any identifier gives a branch that Git accepts', () => {
  for (const text of NAMED) {
    const branch = branchOf(text);
    assert.equal(execFileSync('git', ['check-ref-format', '--branch', branch], { encoding: 'utf8' }).trim(), branch, text);
  }
});

test('identifiers with the same readable prefix get distinct names', () => {
  const pairs = [['a/b', 'a_b'], ['a.b', 'a:b'], ['..', '.'], ['x'.repeat(40), `${'x'.repeat(40)}y`]] as const;
  for (const [one, other] of pairs) {
    const [first, second] = [attemptOf(one), attemptOf(other)];
    assert.match(first, SAFE_NAME);
    assert.equal(first.slice(0, -32), second.slice(0, -32), `${one} and ${other} share a prefix`);
    assert.notEqual(first, second);
    assert.notEqual(branchOf(one), branchOf(other));
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

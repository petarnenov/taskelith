import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { parseIdentifier } from '@taskelith/kernel';
import type { AttemptId } from '@taskelith/execution';
import type { TaskId } from '@taskelith/sdlc';
import {
  DIRTY_REASONS,
  GIT_BUILT_ENVIRONMENT,
  GIT_CLIENT_PINS,
  GIT_COMMAND_SCOPE_SETTINGS,
  HEAD_SNAPSHOT_CONTENT_TYPE,
  HEAD_SNAPSHOT_EVIDENCE_KIND,
  RECLAIM_CONTAINMENT_PREFIX,
  TASK_BRANCH_PREFIX,
  WORKSPACE_FAILURE_REASONS,
  WORKSPACE_KINDS,
  WORKSPACE_LAYOUT,
  WORKSPACE_MODES,
  WORKSPACE_NAME_RULES,
  checkCredentialScope,
  checkGitClient,
  checkRemoteTransport,
  cleanHead,
  decodeGitPath,
  gitConfigEnvironment,
  isUtf8Text,
  isSameCodeHead,
  parseCodeHeadIdentity,
  reclaimContainmentName,
  taskBranchName,
  taskBranchPushArguments,
  workspaceDirectoryName,
  type CodeHeadIdentity,
  type IdentifierDigest,
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
      'workspace-handed-off', 'other-workspace-handed-off', 'reclaim-failed', 'unsafe-checkout', 'gitlink-in-tree',
      'insecure-remote', 'git-client-mismatch', 'non-utf8-path'],
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
  assert.equal(HEAD_SNAPSHOT_CONTENT_TYPE, 'application/x-tar');
  assert.equal(RECLAIM_CONTAINMENT_PREFIX, 'reclaim-');
});

test('the Git client pins hold the contract values, frozen', () => {
  assert.deepEqual(GIT_CLIENT_PINS, {
    linux: { path: '/usr/bin/git', version: 'git version 2.43.0' },
    darwin: { path: '/usr/bin/git', version: 'git version 2.50.1 (Apple Git-155)' },
  });
  assert.ok([GIT_CLIENT_PINS, GIT_CLIENT_PINS.linux, GIT_CLIENT_PINS.darwin].every(Object.isFrozen));
});

test('only the exact pinned version string passes the Git client gate', () => {
  const pin = { path: '/opt/git', version: 'git version 2.50.1 (Apple Git-155)' };
  assert.ok(checkGitClient(pin, 'git version 2.50.1 (Apple Git-155)\n').ok);
  for (const reported of ['git version 2.50.1', 'git version 2.56.0', 'git version 2.33.0 (Apple Git-136)', '']) {
    const checked = checkGitClient(pin, reported);
    assert.ok(!checked.ok);
    assert.equal(checked.error.code, 'precondition-failed');
    assert.deepEqual(checked.error.details, { reason: 'git-client-mismatch' });
    assert.match(checked.error.message, /\/opt\/git/);
  }
});

test('a remote must be HTTPS without user information; loopback HTTP only where allowed', () => {
  const accepted: [string, 'https-only' | 'https-or-loopback-http'][] = [
    ['https://scm.example/acme/project.git', 'https-only'],
    ['https://scm.example/acme/project.git', 'https-or-loopback-http'],
    ['http://127.0.0.1:8080/acme/project.git', 'https-or-loopback-http'],
  ];
  for (const [remote, policy] of accepted) assert.ok(checkRemoteTransport(remote, policy).ok, remote);
  const refused: [string, 'https-only' | 'https-or-loopback-http'][] = [
    ['http://127.0.0.1:8080/acme/project.git', 'https-only'],
    ['http://localhost/acme/project.git', 'https-or-loopback-http'],
    ['http://scm.example/acme/project.git', 'https-or-loopback-http'],
    ['https://agent@scm.example/acme/project.git', 'https-only'],
    ['https://:token@scm.example/acme/project.git', 'https-only'],
    ['ssh://git@scm.example/acme/project.git', 'https-only'],
    ['file:///srv/project.git', 'https-only'],
    ['scm.example:acme/project.git', 'https-only'],
    ['not a URL', 'https-only'],
  ];
  for (const [remote, policy] of refused) {
    const checked = checkRemoteTransport(remote, policy);
    assert.ok(!checked.ok, remote);
    assert.equal(checked.error.code, 'invalid');
    assert.deepEqual(checked.error.details, { reason: 'insecure-remote' });
    assert.doesNotMatch(checked.error.message, /token|agent/);
  }
});

test('a push is atomic and leased on the expected head, or on an absent branch', () => {
  const branch = 'taskelith/task-1';
  const remote = 'https://scm.example/acme/project.git';
  const refspec = `HEAD:refs/heads/${branch}`;
  assert.deepEqual(taskBranchPushArguments(branch, SHA1, remote), ['push', '--atomic', `--force-with-lease=refs/heads/${branch}:${SHA1}`, remote, refspec]);
  assert.deepEqual(taskBranchPushArguments(branch, null, remote), ['push', '--atomic', `--force-with-lease=refs/heads/${branch}:`, remote, refspec]);
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

const sha256: IdentifierDigest = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const attemptOf = (text: string) => workspaceDirectoryName(text as AttemptId, sha256);
const branchOf = (text: string) => taskBranchName(text as TaskId, sha256);
const digestOf = (text: string) => sha256(text).slice(0, 32);
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

test('a name keeps the first 32 characters of the injected digest', () => {
  const digest: IdentifierDigest = () => `${'a'.repeat(32)}${'b'.repeat(32)}`;
  assert.equal(workspaceDirectoryName('x/y' as AttemptId, digest), `x_y-${'a'.repeat(32)}`);
  assert.equal(taskBranchName('..' as TaskId, digest), `taskelith/${'a'.repeat(32)}`);
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
  const credential: WorkspaceCredential = { credentialId: 'c-1', secret: 's', authorization: 'Basic cw==', repositories: [repository], permissions: ['read-code'] };
  assert.ok(checkCredentialScope(credential, repository, 'read-code').ok);
  const write = checkCredentialScope(credential, repository, 'write-code');
  assert.ok(!write.ok);
  assert.deepEqual([write.error.code, write.error.details.reason], ['forbidden', 'credential-out-of-scope']);
  assert.ok(!checkCredentialScope(credential, identifier('RepositoryId', 'acme/other') as RepositoryId, 'read-code').ok);
});

test('the push command is exactly the leased options, the remote, and one refspec', () => {
  const branch = 'taskelith/task-1';
  assert.deepEqual(taskBranchPushArguments(branch, null, 'https://scm.example/a.git'), [
    'push', '--atomic', `--force-with-lease=refs/heads/${branch}:`, 'https://scm.example/a.git', `HEAD:refs/heads/${branch}`,
  ]);
});

test('the built Git environment holds the contract settings, the header last', () => {
  assert.deepEqual(GIT_BUILT_ENVIRONMENT, {
    PATH: '/usr/bin:/bin', HOME: '/nonexistent', LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0',
    GIT_NO_REPLACE_OBJECTS: '1' });
  assert.deepEqual(GIT_COMMAND_SCOPE_SETTINGS, [
    ['core.hooksPath', '/dev/null'], ['credential.helper', ''], ['diff.ignoreSubmodules', 'all'],
    ['status.submoduleSummary', 'false'], ['submodule.recurse', 'false'], ['fetch.recurseSubmodules', 'false'],
    ['push.recurseSubmodules', 'no'], ['core.untrackedCache', 'false'],
  ]);
  const local = gitConfigEnvironment();
  assert.equal(local.GIT_CONFIG_COUNT, '8');
  assert.equal(local.GIT_CONFIG_KEY_0, 'core.hooksPath');
  assert.equal(local.GIT_CONFIG_VALUE_1, '');
  assert.equal(local.GIT_CONFIG_KEY_8, undefined);
  const remote = gitConfigEnvironment('Basic dG9rZW4=');
  assert.equal(remote.GIT_CONFIG_COUNT, '9');
  assert.deepEqual([remote.GIT_CONFIG_KEY_8, remote.GIT_CONFIG_VALUE_8], ['http.extraHeader', 'Authorization: Basic dG9rZW4=']);
  assert.equal(remote.GIT_TERMINAL_PROMPT, '0');
});

test('a Git path is accepted only as valid UTF-8 bytes', () => {
  assert.deepEqual(decodeGitPath(new TextEncoder().encode('café/ü')), { ok: true, value: 'café/ü' });
  for (const bytes of [Uint8Array.of(0x66, 0xff), Uint8Array.of(0xc3), Uint8Array.of(0xed, 0xa0, 0x80)]) {
    const decoded = decodeGitPath(bytes);
    assert.ok(!decoded.ok);
    assert.equal(decoded.error.code, 'precondition-failed');
    assert.deepEqual(decoded.error.details, { reason: 'non-utf8-path' });
  }
  assert.ok(isUtf8Text('café/ü 😀'));
  assert.ok(!isUtf8Text('lone \uD800'));
  assert.ok(!isUtf8Text('\uDC00 lone'));
});

test("the reclaim containment is named after the attempt's workspace", () => {
  const attemptId = identifier('AttemptId', '../attempt') as AttemptId;
  assert.equal(reclaimContainmentName(attemptId, sha256), `reclaim-${attemptOf('../attempt')}`);
});

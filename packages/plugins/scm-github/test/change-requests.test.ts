import assert from 'node:assert/strict';
import test from 'node:test';
import { GIT_URL } from './github-emulator.ts';
import { githubTestbed, HIDDEN, PROJECT, type GithubTestbed } from './github-fixture.ts';

const REVIEW = 'taskelith/review';

async function value<T>(result: Promise<{ ok: true; value: T } | { ok: false; error: unknown }>): Promise<T> {
  const settled = await result;
  assert.ok(settled.ok, JSON.stringify(settled));
  return settled.value;
}

async function code(result: Promise<{ ok: boolean; error?: { code: string } }>): Promise<string | undefined> {
  const settled = await result;
  return settled.ok ? undefined : settled.error?.code;
}

async function openPull({ provider, emulator }: GithubTestbed) {
  const headBranch = `topic-${emulator.requests.length}`;
  emulator.createBranch(PROJECT, headBranch);
  const request = { repository: PROJECT, baseBranch: 'main', headBranch, title: 'Change', description: 'Body' };
  return value(provider.openChangeRequest(request));
}

test('protection requires the contexts and binds administrators', async () => {
  const testbed = githubTestbed();
  await value(testbed.provider.ensureMergeProtection({ repository: PROJECT, branch: 'main', requiredStatuses: ['existing'] }));
  const protection = await value(testbed.provider.ensureMergeProtection({ repository: PROJECT, branch: 'main', requiredStatuses: ['existing', REVIEW] }));
  assert.deepEqual(protection, { repository: PROJECT, branch: 'main', requiredStatuses: ['existing', REVIEW], bindsProvider: true });
  const put = testbed.emulator.requests.filter((request) => request.method === 'PUT').at(-1);
  assert.deepEqual(put?.body, {
    required_status_checks: { strict: false, contexts: ['existing', REVIEW] },
    enforce_admins: true,
    required_pull_request_reviews: null,
    restrictions: null,
  });
});

test('protection that GitHub does not enforce on administrators is reported as not binding', async () => {
  const { provider } = githubTestbed({}, { ignoresEnforceAdmins: true });
  const protection = await value(provider.ensureMergeProtection({ repository: PROJECT, branch: 'main', requiredStatuses: [REVIEW] }));
  assert.equal(protection.bindsProvider, false);
});

test('a protection GitHub refuses to read is not overwritten', async () => {
  const { provider, emulator } = githubTestbed();
  emulator.refuseNext('GET', /protection$/, 403);
  assert.equal(await code(provider.ensureMergeProtection({ repository: PROJECT, branch: 'main', requiredStatuses: [REVIEW] })), 'forbidden');
  assert.equal(emulator.requests.some((request) => request.method === 'PUT'), false);
});

test('the remote URL is the clone URL, and a repository the App cannot see is not found', async () => {
  const { provider } = githubTestbed();
  assert.deepEqual(await value(provider.resolveRemoteUrl({ repository: PROJECT })), { repository: PROJECT, remoteUrl: `${GIT_URL}/${PROJECT}.git` });
  assert.equal(await code(provider.resolveRemoteUrl({ repository: HIDDEN })), 'not-found');
  assert.equal(await code(provider.resolveRemoteUrl({ repository: 'acme/..' })), 'invalid');
});

test('a pull request is read back by its number as a string', async () => {
  const testbed = githubTestbed();
  const opened = await openPull(testbed);
  assert.match(opened.id, /^\d+$/);
  assert.deepEqual(await value(testbed.provider.readChangeRequest({ repository: PROJECT, changeRequest: opened.id })), opened);
  assert.equal(await code(testbed.provider.readChangeRequest({ repository: PROJECT, changeRequest: '999' })), 'not-found');
  assert.equal(await code(testbed.provider.readChangeRequest({ repository: PROJECT, changeRequest: 'pr-1' })), 'not-found');
});

test('a merge waits for the required review status and then merges the expected head', async () => {
  const testbed = githubTestbed();
  const { provider } = testbed;
  await value(provider.ensureMergeProtection({ repository: PROJECT, branch: 'main', requiredStatuses: [REVIEW] }));
  const opened = await openPull(testbed);
  const merge = { repository: PROJECT, changeRequest: opened.id, expectedHead: opened.headCommit, method: 'squash' };
  const status = { repository: PROJECT, commit: opened.headCommit, context: REVIEW, description: 'Review' };
  await value(provider.setCommitStatus({ ...status, state: 'pending' }));
  assert.equal(await code(provider.mergeChangeRequest(merge)), 'precondition-failed');
  await value(provider.setCommitStatus({ ...status, state: 'success', targetUrl: 'https://taskelith.test/review' }));
  assert.equal(await code(provider.mergeChangeRequest({ ...merge, expectedHead: 'f'.repeat(40) })), 'precondition-failed');
  const merged = await value(provider.mergeChangeRequest(merge));
  assert.equal(merged.mergeCommit, testbed.emulator.branchHead(PROJECT, 'main'));
  assert.equal((await value(provider.readChangeRequest({ repository: PROJECT, changeRequest: opened.id }))).state, 'merged');
});

test('an undeclared merge method is unavailable without a request', async () => {
  const { provider, emulator } = githubTestbed({ mergeMethods: ['squash'] });
  const merge = { repository: PROJECT, changeRequest: '1', expectedHead: 'abc', method: 'rebase' };
  assert.equal(await code(provider.mergeChangeRequest(merge)), 'unavailable');
  assert.equal(emulator.requests.length, 0);
});

test('a commit status needs a port state, and a refusal keeps its status only', async () => {
  const { provider, emulator } = githubTestbed();
  const status = { repository: PROJECT, commit: 'abc', context: REVIEW, description: 'Review' };
  assert.equal(await code(provider.setCommitStatus({ ...status, state: 'done' })), 'invalid');
  emulator.refuseNext('POST', /statuses/, 403);
  const refused = await provider.setCommitStatus({ ...status, state: 'success' });
  assert.deepEqual(refused.ok ? undefined : refused.error, {
    code: 'forbidden',
    message: 'GitHub refused to set a commit status',
    details: { status: '403' },
  });
});

const MAIN = { repository: PROJECT, branch: 'main' };
const ENSURE = { ...MAIN, requiredStatuses: [REVIEW] };

test('a branch without protection gets the required contexts', async () => {
  const { provider, emulator } = githubTestbed();
  const protection = await value(provider.ensureMergeProtection(ENSURE));
  assert.deepEqual(protection, { ...MAIN, requiredStatuses: [REVIEW], bindsProvider: true });
  assert.deepEqual(emulator.protectionOf(PROJECT, 'main')?.contexts, [REVIEW]);
});

test('an ensured protection is not written again', async () => {
  const { provider, emulator } = githubTestbed();
  const first = await value(provider.ensureMergeProtection(ENSURE));
  const second = await value(provider.ensureMergeProtection(ENSURE));
  assert.deepEqual(second, first);
  assert.equal(emulator.requests.filter((request) => request.method === 'PUT').length, 1);
});

test('a branch with only this protection is protected again', async () => {
  const { provider, emulator } = githubTestbed();
  emulator.protectBranch(PROJECT, 'main', { contexts: [REVIEW], enforceAdmins: false });
  const protection = await value(provider.ensureMergeProtection(ENSURE));
  assert.deepEqual(protection, { ...MAIN, requiredStatuses: [REVIEW], bindsProvider: true });
});

const FOREIGN_SETTINGS: readonly (readonly [string, Parameters<GithubTestbed['emulator']['protectBranch']>[2]])[] = [
  ['required_pull_request_reviews', { reviews: { required_approving_review_count: 1 } }],
  ['restrictions', { restrictions: { users: [], teams: [], apps: [] } }],
  ['required_status_checks.strict', { strict: true }],
  ['required_status_checks.contexts', { contexts: ['ci/build'] }],
  ['required_linear_history', { enabled: ['required_linear_history'] }],
];

for (const [setting, foreign] of FOREIGN_SETTINGS) {
  test(`a branch whose protection has ${setting} is refused untouched`, async () => {
    const { provider, emulator } = githubTestbed();
    emulator.protectBranch(PROJECT, 'main', foreign);
    const before = emulator.protectionOf(PROJECT, 'main');
    const refused = await provider.ensureMergeProtection(ENSURE);
    assert.equal(refused.ok ? undefined : refused.error.code, 'precondition-failed');
    assert.equal(refused.ok ? undefined : refused.error.details['settings'], setting);
    assert.equal(emulator.requests.some((request) => request.method === 'PUT'), false);
    assert.equal(emulator.protectionOf(PROJECT, 'main'), before);
  });
}

test('every conflicting setting is named', async () => {
  const { provider, emulator } = githubTestbed();
  emulator.protectBranch(PROJECT, 'main', { strict: true, reviews: {}, restrictions: {} });
  const refused = await provider.ensureMergeProtection(ENSURE);
  const named = refused.ok ? undefined : refused.error.details['settings'];
  assert.equal(named, 'required_pull_request_reviews,restrictions,required_status_checks.strict');
});

test('a remote URL outside the contract is refused', async () => {
  for (const url of ['https://[::1]/acme/project.git', 'https://github.test:0/acme/project.git', `https://github.test/${'a'.repeat(2048)}`]) {
    const { provider, emulator } = githubTestbed();
    emulator.answerNext('GET', /^\/repos\/acme\/project$/, 200, { clone_url: url });
    assert.equal(await code(provider.resolveRemoteUrl({ repository: PROJECT })), 'internal', url);
  }
});

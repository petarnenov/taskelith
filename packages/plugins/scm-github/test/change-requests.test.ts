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
  const protection = await value(testbed.provider.ensureMergeProtection({ repository: PROJECT, branch: 'main', requiredStatuses: [REVIEW] }));
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

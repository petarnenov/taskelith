import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { ok } from '@taskelith/kernel';
import type { SourceControlProvider } from '@taskelith/integrations';
import { conformanceFixture, githubTestbed } from '../packages/plugins/scm-github/test/github-fixture.ts';
import { isClean, isDone, planCleanup, type RepositoryState } from '../scripts/github-conformance-cleanup.ts';
import { discoverInstallation, type Requester } from '../scripts/github-conformance-discovery.ts';
import { checkedEvidence, findSecretTraces, redactEvidence, revealedKeyLines } from '../scripts/github-conformance-evidence.ts';
import { CONFORMANCE_BRANCH_PREFIX, statusOutcome } from '../scripts/github-conformance-fixture.ts';
import { checkRequest, RequestGuard } from '../scripts/github-conformance-guard.ts';
import { LONG_RUN_TIMING, runLongRefresh } from '../scripts/github-conformance-long-run.ts';
import {
  loadPrivateKey,
  loadSecrets,
  readAppSettings,
  readSettings,
  SETTING_VARIABLES,
  type ConformanceSettings,
} from '../scripts/github-conformance-settings.ts';

// The live GitHub conformance run's local parts, without any network.

const PROJECT = 'petarnenov/taskelith-conformance-project';
const FOREIGN = 'petarnenov/taskelith-conformance-foreign';
const HIDDEN = 'petarnenov/taskelith-conformance-hidden';
const API = 'https://api.github.com';
const ENVIRONMENT = Object.freeze({
  TASKELITH_GITHUB_APP_KEY_FILE: '/keys/app.pem',
  TASKELITH_GITHUB_WEBHOOK_SECRET_FILE: '/keys/webhook-secret',
  TASKELITH_GITHUB_APP_ID: '5456916',
  TASKELITH_GITHUB_INSTALLATION_ID: '174871289',
});
const PRIVATE_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const WEBHOOK_SECRET = 'synthetic-webhook-secret-value';
const GITHUB_TOKEN = `ghs_${'A1b2'.repeat(9)}`;
const JWT = 'eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiIxMjM0In0.c2lnbmF0dXJlLXZhbHVl';
const BASIC = Buffer.from(`x-access-token:${GITHUB_TOKEN}`).toString('base64');

test('the settings name every missing variable and no value', () => {
  const none = readSettings({});
  assert.deepEqual(none, { ok: false, error: `set ${SETTING_VARIABLES.join(', ')}` });
  const withoutKey = readSettings({ ...ENVIRONMENT, TASKELITH_GITHUB_APP_KEY_FILE: '' });
  assert.deepEqual(withoutKey, { ok: false, error: 'set TASKELITH_GITHUB_APP_KEY_FILE' });
  const invalid = readSettings({ ...ENVIRONMENT, TASKELITH_GITHUB_INSTALLATION_ID: 'secret-looking-value' });
  assert.equal(invalid.ok, false);
  assert.ok(!invalid.ok && !invalid.error.includes('secret-looking-value'));
  assert.match(!invalid.ok ? invalid.error : '', /TASKELITH_GITHUB_INSTALLATION_ID must be a numeric GitHub ID/);
  assert.deepEqual(readSettings(ENVIRONMENT), {
    ok: true,
    value: { appId: '5456916', installationId: '174871289', keyFile: '/keys/app.pem', webhookSecretFile: '/keys/webhook-secret' },
  });
});

test('the secrets are read from the named files and refused by variable name', async () => {
  const settings = readSettings(ENVIRONMENT);
  assert.ok(settings.ok);
  const files = (contents: Record<string, string>) => async (path: string) => {
    if (!(path in contents)) throw new Error(`ENOENT ${path}`);
    return contents[path]!;
  };
  const loaded = await loadSecrets(settings.value, files({ '/keys/app.pem': PRIVATE_KEY, '/keys/webhook-secret': `${WEBHOOK_SECRET}\n` }));
  assert.deepEqual(loaded, { ok: true, value: { privateKey: PRIVATE_KEY.replace(/\n$/, ''), webhookSecret: WEBHOOK_SECRET } });
  assert.deepEqual(await loadSecrets(settings.value, files({})), {
    ok: false,
    error: 'TASKELITH_GITHUB_APP_KEY_FILE names a file that cannot be read',
  });
  const notKey = await loadSecrets(settings.value, files({ '/keys/app.pem': 'not a key', '/keys/webhook-secret': WEBHOOK_SECRET }));
  assert.deepEqual(notKey, { ok: false, error: 'TASKELITH_GITHUB_APP_KEY_FILE names no PEM private key' });
  const empty = await loadSecrets(settings.value, files({ '/keys/app.pem': PRIVATE_KEY, '/keys/webhook-secret': '\n' }));
  assert.deepEqual(empty, { ok: false, error: 'TASKELITH_GITHUB_WEBHOOK_SECRET_FILE names an empty file' });
  assertNoSecretIn(JSON.stringify([notKey, empty]));
});

test('the discovery settings need only the App ID and its key file', async () => {
  assert.deepEqual(readAppSettings({}), { ok: false, error: 'set TASKELITH_GITHUB_APP_KEY_FILE, TASKELITH_GITHUB_APP_ID' });
  const invalid = readAppSettings({ ...ENVIRONMENT, TASKELITH_GITHUB_APP_ID: 'x1' });
  assert.deepEqual(invalid, { ok: false, error: 'TASKELITH_GITHUB_APP_ID must be a numeric GitHub ID' });
  const { TASKELITH_GITHUB_APP_KEY_FILE: keyFile, TASKELITH_GITHUB_APP_ID: appId } = ENVIRONMENT;
  const settings = readAppSettings({ TASKELITH_GITHUB_APP_KEY_FILE: keyFile, TASKELITH_GITHUB_APP_ID: appId });
  assert.deepEqual(settings, { ok: true, value: { appId, keyFile } });
  assert.deepEqual(await loadPrivateKey({ appId, keyFile }, async () => PRIVATE_KEY), { ok: true, value: PRIVATE_KEY.replace(/\n$/, '') });
});

test('the discovery finds the installation and checks what its token sees', async () => {
  const found = await discoverInstallation(...githubAnswering({}));
  assert.deepEqual(found.problems, []);
  assert.equal(found.installationId, '42');
  assert.deepEqual(found.installations.map(({ repository, status, installationId, account }) => [repository, status, installationId, account]), [
    [PROJECT, 200, '42', 'petarnenov'],
    [FOREIGN, 200, '42', 'petarnenov'],
    [HIDDEN, 404, undefined, undefined],
  ]);
  assert.deepEqual([found.visibleRepositories, found.hiddenStatus], [[PROJECT, FOREIGN], 404]);
});

test('the discovery reports an installation that differs from the owner setup', async () => {
  const exposed = await discoverInstallation(...githubAnswering({ hiddenInstalled: true, foreignId: 7 }));
  assert.deepEqual(exposed.problems, [
    `${FOREIGN} has another installation`,
    `the App's view of ${HIDDEN} answered 200, not 404`,
    `the token sees ${HIDDEN}`,
    `the token's read of ${HIDDEN} answered 200, not 404`,
  ]);
  const missing = await discoverInstallation(...githubAnswering({ projectMissing: true, foreignMissing: true }));
  assert.deepEqual(missing.problems, [`the App is not installed on ${PROJECT}`, `the App is not installed on ${FOREIGN}`]);
  assert.deepEqual([missing.installationId, missing.visibleRepositories], [undefined, []]);
  const unlisted = githubAnswering({ listingStatus: 403 });
  await assert.rejects(discoverInstallation(...unlisted), /listing the token's repositories returned 403/);
});

test('the guard allows only the disposable repositories and unscoped installation calls', () => {
  const allowed = (url: string, body?: unknown) => checkRequest(new URL(url), body).allowed;
  assert.equal(allowed(`${API}/repos/${PROJECT}/pulls`), true);
  assert.equal(allowed(`${API}/repos/PetarNenov/Taskelith-Conformance-Hidden`), true);
  assert.equal(allowed(`https://github.com/${FOREIGN}.git/info/refs?service=git-upload-pack`), true);
  assert.equal(allowed(`${API}/installation/repositories?per_page=100`), true);
  assert.equal(allowed(`${API}/installation/token`), true);
  assert.equal(allowed(`${API}/repos/petarnenov/taskelith/pulls`), false);
  assert.equal(allowed(`${API}/repos/petarnenov%2Ftaskelith/pulls`), false);
  assert.equal(allowed(`${API}/repos/petarnenov/taskelith-conformance-project-x`), false);
  assert.equal(allowed('https://github.com/petarnenov/taskelith.git/info/refs?service=git-receive-pack'), false);
  assert.equal(allowed(`http://api.github.com/repos/${PROJECT}`), false);
  assert.equal(allowed(`https://api.github.com:8443/repos/${PROJECT}`), false);
  assert.equal(allowed(`https://example.com/repos/${PROJECT}`), false);
  assert.equal(allowed(`${API}/user/repos`), false);
  assert.equal(allowed(`${API}/repos/${PROJECT}/../../repos/petarnenov/taskelith`), false);
});

test('the guard refuses a token request that is not narrowed to the disposable repositories', () => {
  const tokenRequest = (body: unknown) => checkRequest(new URL(`${API}/app/installations/174871289/access_tokens`), body).allowed;
  assert.equal(tokenRequest(JSON.stringify({ repositories: ['taskelith-conformance-project', 'taskelith-conformance-foreign'] })), true);
  assert.equal(tokenRequest(JSON.stringify({ repositories: ['taskelith-conformance-project', 'taskelith'] })), false);
  assert.equal(tokenRequest(JSON.stringify({ permissions: { contents: 'read' } })), false);
  assert.equal(tokenRequest(JSON.stringify({ repositories: [] })), false);
  assert.equal(tokenRequest(JSON.stringify({ repositories: ['taskelith-conformance-project'], repository_ids: [1] })), false);
  assert.equal(tokenRequest(JSON.stringify({ repositories: [7] })), false);
  assert.equal(tokenRequest('{not json'), false);
  assert.equal(tokenRequest(undefined), false);
});

test('the guarded fetch refuses before the call and witnesses minted tokens', async () => {
  const calls: string[] = [];
  const guard = new RequestGuard(async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ token: GITHUB_TOKEN }), { status: 201 });
  });
  await assert.rejects(guard.fetch(`${API}/repos/petarnenov/taskelith/git/refs`, { method: 'POST' }), /refused the repository petarnenov\/taskelith/);
  assert.deepEqual(calls, []);
  assert.equal(guard.refusals.length, 1);
  const body = JSON.stringify({ repositories: ['taskelith-conformance-project'] });
  const minted = await guard.fetch(`${API}/app/installations/1/access_tokens`, { method: 'POST', body });
  assert.equal(minted.status, 201);
  assert.deepEqual(await minted.json(), { token: GITHUB_TOKEN });
  assert.deepEqual(guard.mintedTokens, [GITHUB_TOKEN]);
  await guard.fetch(new Request(`${API}/repos/${PROJECT}`));
  assert.equal(calls.length, 2);
});

test('the cleanup removes protection, then closes the run pull requests, then deletes its branches', () => {
  const runBranch = `${CONFORMANCE_BRANCH_PREFIX}a`;
  const states: RepositoryState[] = [
    {
      repository: PROJECT,
      branches: [runBranch, 'main', 'feature'],
      openPulls: [{ number: 3, headBranch: runBranch }, { number: 4, headBranch: 'feature' }],
      protectedBranches: ['main'],
    },
    { repository: FOREIGN, branches: [`${CONFORMANCE_BRANCH_PREFIX}b`], openPulls: [], protectedBranches: [] },
  ];
  assert.deepEqual(planCleanup(states), [
    { kind: 'remove-protection', repository: PROJECT, branch: 'main' },
    { kind: 'close-pull', repository: PROJECT, number: 3 },
    { kind: 'delete-branch', repository: PROJECT, branch: runBranch },
    { kind: 'delete-branch', repository: FOREIGN, branch: `${CONFORMANCE_BRANCH_PREFIX}b` },
  ]);
  assert.deepEqual(planCleanup([{ repository: PROJECT, branches: ['main'], openPulls: [], protectedBranches: [] }]), []);
});

test('a cleanup step is done when GitHub reports it done or already done', () => {
  const protection = { kind: 'remove-protection', repository: PROJECT, branch: 'main' } as const;
  const branch = { kind: 'delete-branch', repository: PROJECT, branch: `${CONFORMANCE_BRANCH_PREFIX}a` } as const;
  const pull = { kind: 'close-pull', repository: PROJECT, number: 3 } as const;
  assert.deepEqual([isDone(protection, 204), isDone(protection, 404), isDone(protection, 403)], [true, true, false]);
  assert.deepEqual([isDone(branch, 204), isDone(branch, 422), isDone(branch, 500)], [true, true, false]);
  assert.deepEqual([isDone(pull, 200), isDone(pull, 404)], [true, false]);
  assert.equal(isClean({ steps: [{ action: pull, status: 200, done: true }], unobserved: [] }), true);
  assert.equal(isClean({ steps: [{ action: pull, status: 0, done: false }], unobserved: [] }), false);
  assert.equal(isClean({ steps: [], unobserved: [FOREIGN] }), false);
});

test('the fixture maps GitHub statuses to port outcomes', () => {
  const codeOf = (status: number) => {
    const outcome = statusOutcome(status);
    return outcome.ok ? 'ok' : outcome.error.code;
  };
  assert.deepEqual(statusOutcome(201), ok(undefined));
  assert.deepEqual([401, 403, 404, 405, 422].map(codeOf), ['forbidden', 'forbidden', 'forbidden', 'precondition-failed', 'internal']);
});

test('the evidence redaction removes synthetic secrets of every shared shape', () => {
  const text = [
    `token ${GITHUB_TOKEN}`,
    `Authorization: Basic ${BASIC}`,
    `jwt ${JWT}`,
    PRIVATE_KEY,
  ].join('\n');
  const checked = checkedEvidence(text, []);
  assert.ok(checked.ok);
  assertNoSecretIn(checked.value);
  assert.deepEqual(findSecretTraces(redactEvidence(text), []), []);
});

test('the evidence scan fails on a secret trace that the redaction leaves', () => {
  assert.deepEqual(findSecretTraces(`header: Basic ${BASIC}`, []), ['basic-credential']);
  assert.deepEqual(findSecretTraces(`ghp_${'x'.repeat(20)}`, []), ['github-token']);
  assert.deepEqual(findSecretTraces('-----BEGIN RSA PRIVATE KEY-----', []), ['pem-private-key']);
  assert.deepEqual(findSecretTraces('eyJhbGci.eyJpc3Mi', []), ['jwt']);
  assert.deepEqual(findSecretTraces(`the secret is ${WEBHOOK_SECRET}`, [WEBHOOK_SECRET]), ['revealed-value']);
  assert.deepEqual(findSecretTraces('Basic authentication and short', ['short']), []);
  const keyLine = revealedKeyLines(PRIVATE_KEY)[1]!;
  assert.deepEqual(findSecretTraces(`a key line ${keyLine}`, revealedKeyLines(PRIVATE_KEY)), ['revealed-value']);
  assert.ok(revealedKeyLines(PRIVATE_KEY).every((line) => !line.startsWith('-----')));
  const refused = checkedEvidence(`header: Basic ${BASIC} and ${WEBHOOK_SECRET}`, [WEBHOOK_SECRET]);
  assert.deepEqual(refused, {
    ok: false,
    error: 'the evidence still holds secret traces (basic-credential, revealed-value); nothing was saved',
  });
});

test('the long run outlives the original expiry with refreshed and adopted versions', async () => {
  const testbed = githubTestbed();
  const fixture = conformanceFixture(testbed);
  const clock = testbed.options.clock!;
  const startedAt = clock.now();
  const findings = await runLongRefresh(fixture, LONG_RUN_TIMING, clock);
  assert.deepEqual(findings, []);
  assert.ok(clock.now() - startedAt > 60 * 60_000, 'the run did not outlive the hour-long token');
  assert.equal(testbed.emulator.liveRunTokens(), 0);
});

test('the long run reports a refresh that fails and a version that outlives its adoption', async () => {
  const testbed = githubTestbed();
  const fixture = conformanceFixture(testbed);
  const failing: SourceControlProvider = {
    ...fixture.provider,
    refreshRunCredential: async () => ({ ok: false, error: { code: 'unavailable', message: 'down', details: {} } }) as never,
  };
  const failed = await runLongRefresh({ ...fixture, provider: failing }, LONG_RUN_TIMING, testbed.options.clock!);
  assert.deepEqual(failed.map((finding) => finding.message), ['refreshRunCredential of version 1 failed with unavailable']);
  const lax: SourceControlProvider = { ...fixture.provider, confirmRunCredentialAdoption: async () => ok(undefined) };
  const kept = await runLongRefresh({ ...fixture, provider: lax }, LONG_RUN_TIMING, testbed.options.clock!);
  assert.ok(kept.some((finding) => finding.message === 'version 1 after the adoption of 2 still reads'));
});

interface GithubSetup {
  readonly projectMissing?: boolean;
  readonly foreignMissing?: boolean;
  readonly foreignId?: number;
  readonly hiddenInstalled?: boolean;
  readonly listingStatus?: number;
}

function githubAnswering(setup: GithubSetup): [Requester, (installationId: string) => Requester] {
  const installation = (id: number) => ({ status: 200, data: { id, account: { login: 'petarnenov' } } });
  const absent = { status: 404, data: { message: 'Not Found' } };
  const installations: Record<string, { status: number; data: unknown }> = {
    [PROJECT]: setup.projectMissing === true ? absent : installation(42),
    [FOREIGN]: setup.foreignMissing === true ? absent : installation(setup.foreignId ?? 42),
    [HIDDEN]: setup.hiddenInstalled === true ? installation(42) : absent,
  };
  const asApp: Requester = async (_method, path) => installations[path.replace(/^\/repos\/|\/installation$/g, '')]!;
  const visible = setup.hiddenInstalled === true ? [PROJECT, FOREIGN, HIDDEN] : [PROJECT, FOREIGN];
  const asInstallation = () => async (_method: string, path: string) => {
    if (path.startsWith('/installation/repositories')) {
      return { status: setup.listingStatus ?? 200, data: { repositories: visible.map((full_name) => ({ full_name })) } };
    }
    return path === `/repos/${HIDDEN}` && setup.hiddenInstalled !== true ? absent : { status: 200, data: {} };
  };
  return [asApp, asInstallation];
}

function assertNoSecretIn(text: string): void {
  for (const secret of [GITHUB_TOKEN, BASIC, JWT, WEBHOOK_SECRET, 'PRIVATE KEY-----', ...revealedKeyLines(PRIVATE_KEY)]) {
    assert.ok(!text.includes(secret), 'a synthetic secret survived');
  }
}

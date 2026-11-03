import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { ok } from '@taskelith/kernel';
import type { SourceControlProvider } from '@taskelith/integrations';
import { conformanceFixture, githubTestbed } from '../packages/plugins/scm-github/test/github-fixture.ts';
import { cleanUp, isClean, isDone, planCleanup, type CleanupClient, type RepositoryState } from '../scripts/github-conformance-cleanup.ts';
import { GithubNativeClient } from '../scripts/github-conformance-client.ts';
import { discoverInstallation, type Requester } from '../scripts/github-conformance-discovery.ts';
import { checkedEvidence, findSecretTraces, redactEvidence, revealedKeyLines } from '../scripts/github-conformance-evidence.ts';
import { CONFORMANCE_BRANCH_PREFIX, statusOutcome } from '../scripts/github-conformance-fixture.ts';
import { checkRequest, RequestGuard } from '../scripts/github-conformance-guard.ts';
import { LONG_RUN_TIMING, runLongRefresh } from '../scripts/github-conformance-long-run.ts';
import { isRevocationClean, revokeTokens } from '../scripts/github-conformance-revocation.ts';
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
  assert.deepEqual([isDone(branch, 204), isDone(branch, 422), isDone(branch, 500)], [true, false, false]);
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
  assert.deepEqual(findSecretTraces('Basic authentication and more', ['absent-value']), []);
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
  const startedAt = fixture.clock.now();
  const { findings, endings } = await runLongRefresh(fixture, LONG_RUN_TIMING);
  assert.deepEqual(findings, []);
  assert.ok(endings.length > 0 && endings.every((ending) => ending.latencyMs === 0));
  const clock = fixture.clock;
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
  const failed = await runLongRefresh({ ...fixture, provider: failing }, LONG_RUN_TIMING);
  assert.deepEqual(failed.findings.map((finding) => finding.message), ['refreshRunCredential of version 1 failed with unavailable']);
  const lax: SourceControlProvider = { ...fixture.provider, confirmRunCredentialAdoption: async () => ok(undefined) };
  const kept = await runLongRefresh({ ...fixture, provider: lax }, LONG_RUN_TIMING);
  assert.ok(kept.findings.some((finding) => finding.message === 'version 1 after the adoption of 2 still reads'));
});

test('the guarded fetch follows no redirect, to any host', async () => {
  const chain = [`${API}/repos/${PROJECT}/a`, `${API}/repos/${FOREIGN}/b`, `${API}/repos/petarnenov/taskelith/c`];
  const cases = [
    [`${API}/repos/${PROJECT}`, `${API}/repos/petarnenov/taskelith`],
    [`${API}/repos/${PROJECT}/pulls`, 'https://example.com/collect'],
    chain,
  ];
  for (const hops of cases) {
    const { inner, calls } = redirectingFetch(hops);
    const guard = new RequestGuard(inner);
    await assert.rejects(guard.fetch(hops[0]!), /refused a redirect/);
    assert.deepEqual([calls, guard.refusals.length], [[hops[0]], 1]);
  }
});

test('the long run reports a refusal check that fails with another code than forbidden', async () => {
  for (const code of ['unavailable', 'internal'] as const) {
    const { findings } = await runLongRefresh(refusingWith(failedWith(code)), LONG_RUN_TIMING);
    const messages = findings.map((finding) => finding.message);
    for (const subject of ['after the adoption of 2', 'the original version past its expiry', 'after the revocation']) {
      assert.ok(messages.some((message) => message.includes(subject) && message.endsWith(`failed with ${code}, not forbidden`)), subject);
    }
  }
});

test('the long run stops on a malformed probe result', async () => {
  const { findings } = await runLongRefresh(refusingWith({ ok: 'no' }), LONG_RUN_TIMING);
  assert.deepEqual(findings.map((finding) => finding.check), ['fixture']);
});

test('the long run names no payload of a thrown value', async () => {
  const fixture = conformanceFixture(githubTestbed());
  const throwing: SourceControlProvider = {
    ...fixture.provider,
    issueRunCredential: async () => { throw new Error(`payload ${GITHUB_TOKEN}`); },
  };
  const { findings } = await runLongRefresh({ ...fixture, provider: throwing }, LONG_RUN_TIMING);
  assert.deepEqual(findings.map((finding) => finding.check), ['threw']);
  assert.ok(findings.every((finding) => !finding.message.includes('payload')));
});

test('the evidence scan finds a known secret of any accepted length and through JSON escaping', async () => {
  assert.deepEqual(findSecretTraces('a value abc12345', ['abc12345']), ['revealed-value']);
  const escaped = 'synthetic"secret\nwith escapes';
  assert.equal(checkedEvidence(JSON.stringify({ message: `leaked ${escaped}` }), [escaped]).ok, false);
  const settings = readSettings(ENVIRONMENT);
  assert.ok(settings.ok);
  const short = await loadSecrets(settings.value, async (path) => (path.endsWith('app.pem') ? PRIVATE_KEY : 'abc123'));
  assert.deepEqual(short, { ok: false, error: 'TASKELITH_GITHUB_WEBHOOK_SECRET_FILE names a secret shorter than 8 characters' });
});

test('the evidence redacts and scans every GitHub token family', () => {
  const classic = ['ghp', 'gho', 'ghu', 'ghs', 'ghr'].map((prefix) => `${prefix}_${'A1b2'.repeat(9)}`);
  for (const token of [...classic, `github_pat_${'A1'.repeat(11)}_${'b2'.repeat(29)}c`]) {
    assert.ok(findSecretTraces(`payload ${token}`, []).includes('github-token'), token.slice(0, 4));
    const checked = checkedEvidence(`error payload ${token}`, []);
    assert.ok(checked.ok && !checked.value.includes(token), token.slice(0, 4));
  }
});

test('the outer cleanup revokes every minted token once and records each failure', async () => {
  const answers: Record<string, number> = { a: 204, b: 401, c: 500 };
  const revoked: string[] = [];
  const report = await revokeTokens(['a', 'b', 'a', 'c', 'd'], async (token) => {
    revoked.push(token);
    if (token === 'd') throw new Error('down');
    return answers[token]!;
  });
  assert.deepEqual(revoked, ['a', 'b', 'c', 'd']);
  assert.deepEqual(report, { revoked: 1, alreadyEnded: 1, failedStatuses: [500, 0] });
  assert.equal(isRevocationClean(report), false);
  assert.equal(isRevocationClean(await revokeTokens([], async () => 204)), true);
});

test('the fixture client mints a new token on renewal and the guard witnesses both', async () => {
  let now = Date.parse('2026-11-03T10:00:00Z');
  let minted = 0;
  const guard = new RequestGuard(async () => {
    minted += 1;
    const expiresAt = new Date(now + 60 * 60_000).toISOString();
    return Response.json({ token: `ghs_${String(minted).repeat(36)}`, expires_at: expiresAt }, { status: 201 });
  });
  const identity = { appId: '1', installationId: '2', privateKey: PRIVATE_KEY };
  const client = new GithubNativeClient(identity, guard.fetch, () => now);
  await client.request('GET', `/repos/${PROJECT}`);
  now += 56 * 60_000;
  await client.request('GET', `/repos/${PROJECT}`);
  assert.equal(new Set(guard.mintedTokens).size, 2);
});

test('a branch deletion refused with 422 is done only when the ref is gone', async () => {
  for (const [refStatus, done] of [[404, true], [200, false]] as const) {
    const report = await cleanUp(branchCleanupClient(refStatus));
    const deletion = report.steps.find((step) => step.action.kind === 'delete-branch');
    assert.deepEqual([deletion?.status, deletion?.done], [422, done]);
  }
});

test('a listing beyond the page limit fails instead of returning a part', async () => {
  const fetch = pagingFetch(51);
  const client = new GithubNativeClient({ appId: '1', installationId: '2', privateKey: PRIVATE_KEY }, fetch);
  await assert.rejects(client.listOpenPulls(PROJECT), /more than 50 pages/);
  const shorter = new GithubNativeClient({ appId: '1', installationId: '2', privateKey: PRIVATE_KEY }, pagingFetch(50));
  assert.equal((await shorter.listOpenPulls(PROJECT)).length, 5000);
});

function redirectingFetch(hops: readonly string[]): { inner: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const inner = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    let url = input instanceof Request ? input.url : String(input);
    for (;;) {
      calls.push(url);
      const next = hops[hops.indexOf(url) + 1];
      if (next === undefined) return Response.json({});
      if (init?.redirect === 'error') throw new TypeError('fetch failed');
      if (init?.redirect === 'manual') return new Response(null, { status: 302, headers: { location: next } });
      url = next;
    }
  };
  return { inner, calls };
}

function failedWith(code: string): unknown {
  return { ok: false, error: { code, message: 'synthetic', details: {} } };
}

// The emulated fixture, with every refused probe answered by `answer`.
function refusingWith(answer: unknown) {
  const fixture = conformanceFixture(githubTestbed());
  return {
    ...fixture,
    attemptAction: async (...probe: Parameters<typeof fixture.attemptAction>) => {
      const result = await fixture.attemptAction(...probe);
      return (result.ok ? result : answer) as typeof result;
    },
  };
}

function branchCleanupClient(refStatus: number): CleanupClient {
  const branch = `${CONFORMANCE_BRANCH_PREFIX}a`;
  return {
    request: async (method, path) => {
      if (path.includes('/git/matching-refs/')) return { status: 200, data: [{ ref: `refs/heads/${branch}` }] };
      if (path.includes('/pulls')) return { status: 200, data: [] };
      if (path.endsWith('/protection')) return { status: 404, data: null };
      if (method === 'DELETE') return { status: 422, data: null };
      return { status: path.endsWith(`/git/ref/heads/${branch}`) ? refStatus : 500, data: null };
    },
    listOpenPulls: async () => [],
  };
}

function pagingFetch(pages: number): typeof fetch {
  return async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.endsWith('/access_tokens')) {
      return Response.json({ token: GITHUB_TOKEN, expires_at: new Date(Date.now() + 3_600_000).toISOString() }, { status: 201 });
    }
    const page = Number(url.searchParams.get('page') ?? '1');
    const next = new URL(url);
    next.searchParams.set('page', String(page + 1));
    const headers: Record<string, string> = page < pages ? { link: `<${next.href}>; rel="next"` } : {};
    return Response.json(Array.from({ length: 100 }, (_, index) => ({ number: page * 100 + index })), { headers });
  };
}

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

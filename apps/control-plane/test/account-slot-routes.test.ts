import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import {
  AuthorizationService,
  InMemoryAccessStore,
  LoginThrottle,
  OwnerBootstrapService,
  PrincipalAdministration,
  ProjectSetupService,
  SessionService,
} from '@taskelith/access';
import { checkHttpSchema } from '@taskelith/contracts';
import {
  CLAUDE_CODE_HARNESS_ID,
  ControlPlaneApi,
  accountPoolServices,
  createApiServer,
  type ApiServices,
  type ControlPlaneStore,
  type ControlPlaneTransaction,
} from '@taskelith/control-plane';
import { InMemoryTaskRepository, type HarnessPluginId } from '@taskelith/execution';
import { err, failure, instantFromEpochMilliseconds, ok, type Instant } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import {
  FIRST_SLOT_REVISION,
  InMemorySlotCredentials,
  InMemoryTaskLineage,
  parseAccountSlot,
  parseDefaultCooldownMinutes,
  parseSlotCredentialVersion,
  SlotCredentialsUnavailable,
  type AccountSlot,
  type ProjectId,
  type ProviderCredentialId,
  type SlotSecret,
  type SubscriptionMechanismId,
} from '@taskelith/scheduling';
import { Argon2idPasswordHasher, NodeSecrets } from '@taskelith/secrets';
import { id, value } from '@taskelith/testing';
import { inMemoryCapacity } from './in-memory-capacity.ts';
import { addProjects } from './project-fixtures.ts';

const OPERATOR = `tkop_${'D'.repeat(43)}`;
const PASSWORD = 'password of the account slot route test';
const INVOCATION = { actor: 'root@control-plane-1', reason: 'account slot route test' };
const BEARER = { authorization: `Bearer ${OPERATOR}` };
const UNKNOWN = `s${'f'.repeat(32)}`;
const OWNER_DENIAL = { reason: 'role-required', requiredRole: 'installation-owner' };
const STORE_OUTAGE = failure('unavailable', 'the capacity store is down');
const hasher = value(Argon2idPasswordHasher.create({ parameters: { memoryKib: 64, passes: 1, parallelism: 1 } }));

interface Answer {
  readonly status: number;
  readonly text: string;
  readonly body: Record<string, unknown>;
  readonly headers: Headers;
}

type RequestHeaders = Record<string, string>;

// A credential of this run only, so no fixture or snapshot holds one.
const newCredential = () => `fixture-${randomBytes(24).toString('hex')}`;

function clockAt(): { now(): Instant } {
  return { now: () => value(instantFromEpochMilliseconds(Date.parse('2026-11-05T09:00:00.000Z'))) };
}

async function browser(base: string, loginName: string): Promise<RequestHeaders> {
  const anonymous = await fetch(`${base}/session`);
  const cookie = /^(__Host-taskelith-session=[^;]*);/.exec(anonymous.headers.get('set-cookie') ?? '')![1]!;
  const csrf = String((await anonymous.json() as { csrfToken: string }).csrfToken);
  const loggedIn = await fetch(`${base}/session`, {
    method: 'POST', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify({ loginName, password: PASSWORD }),
  });
  assert.equal(loggedIn.status, 200);
  const rotated = /^(__Host-taskelith-session=[^;]*);/.exec(loggedIn.headers.get('set-cookie') ?? '')![1]!;
  return { cookie: rotated, 'x-csrf-token': String((await loggedIn.json() as { csrfToken: string }).csrfToken) };
}

// Each test's own stores and server: the real session and role path, the
// composed account pool over an in-memory transaction, and a log sink.
async function fixture(t: TestContext) {
  const store = new InMemoryAccessStore();
  const secrets = new NodeSecrets();
  const clock = clockAt();
  const sessions = new SessionService({ store, hasher, secrets, random: secrets, clock, throttle: new LoginThrottle({ clock, sleep: async () => undefined }) });
  const administration = new PrincipalAdministration({ store, hasher, random: secrets, clock });
  const owner = value(await new OwnerBootstrapService({ store, random: secrets, clock }).ensureOwner(INVOCATION)).principalId;
  value(await administration.setPassword(owner, 'owner', PASSWORD, INVOCATION));
  const vera = value(await administration.createPrincipal(owner, 'vera', INVOCATION)).principalId;
  value(await administration.setPassword(owner, 'vera', PASSWORD, INVOCATION));
  await addProjects(store, ['project-1', 'project-2'], clock.now());
  value(await administration.assignProjectMember(owner, { projectId: 'project-1', principalId: vera, role: 'project-viewer' }, INVOCATION));
  const tasks = new InMemoryTaskRepository();
  const lineage = new InMemoryTaskLineage();
  const tx = { tasks, lineage, ...inMemoryCapacity(tasks, lineage), now: async () => clock.now() } as unknown as ControlPlaneTransaction;
  let storeIsDown = false;
  const capacity = {
    transaction: (work: (transaction: ControlPlaneTransaction) => Promise<unknown>) => (storeIsDown ? Promise.resolve(err(STORE_OUTAGE)) : work(tx)),
    readCommitted: (work: (transaction: ControlPlaneTransaction) => Promise<unknown>) => (storeIsDown ? Promise.resolve(err(STORE_OUTAGE)) : work(tx)),
  } as unknown as ControlPlaneStore;
  const credentials = new InMemorySlotCredentials(() => clock.now());
  const pool = accountPoolServices({
    store: capacity, credentials, projects: new ProjectSetupService({ store, random: secrets, clock }), defaultCooldown: value(parseDefaultCooldownMinutes(60)),
  });
  const sink = new InMemoryLogSink();
  const server = createApiServer(new ControlPlaneApi({
    operator: { authenticate: async (secret: string) => (secret === OPERATOR ? ok(owner) : err(failure('forbidden', 'not the operator'))) },
    sessions, authorization: new AuthorizationService(store), accountSlots: pool.slots,
  } as unknown as ApiServices), { logger: new Logger(sink, clock) });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const answers: Answer[] = [];
  const call = async (method: string, path: string, headers: RequestHeaders = {}, body?: unknown): Promise<Answer> => {
    const response = await fetch(`${base}${path}`, {
      method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    });
    const text = await response.text();
    const answer = { status: response.status, text, body: text === '' ? {} : JSON.parse(text) as Record<string, unknown>, headers: response.headers };
    answers.push(answer);
    return answer;
  };
  const sent: string[] = [];
  const added = async (allowedProjects: readonly string[] = ['project-1']): Promise<Record<string, unknown>> => {
    const credential = newCredential();
    sent.push(credential);
    const answer = await call('POST', '/account-slots', BEARER, { harnessId: CLAUDE_CODE_HARNESS_ID, mechanismId: 'subscription-token', allowedProjects, credential });
    assert.equal(answer.status, 201, 'the fixture slot is added');
    return answer.body;
  };
  // No answer or log record holds a credential that a test sent.
  const leakFree = () => {
    const logged = JSON.stringify(sink.records);
    for (const credential of sent) {
      assert.ok(answers.every((answer) => !answer.text.includes(credential) && ![...answer.headers.values()].some((header) => header.includes(credential))), 'an answer holds a credential');
      assert.ok(!logged.includes(credential), 'a log record holds a credential');
    }
    for (const answer of answers) assert.equal(answer.headers.get('cache-control'), 'no-store');
  };
  return {
    call, added, sent, tx, credentials, sink, leakFree, takeStoreDown: () => { storeIsDown = true; }, OWNER: await browser(base, 'owner'), VERA: await browser(base, 'vera'),
  };
}

const slotPath = (slotId: unknown) => `/account-slots/${String(slotId)}`;

const COMMANDS = (slotId: string, credential: string) => [
  ['POST', '/account-slots', { harnessId: CLAUDE_CODE_HARNESS_ID, mechanismId: 'subscription-token', allowedProjects: ['project-1'], credential }],
  ['PATCH', slotPath(slotId), { expectedRevision: 1, concurrencyLimit: 2 }],
  ['POST', `${slotPath(slotId)}/revocation`, { expectedRevision: 1 }],
  ['POST', `${slotPath(slotId)}/reinstatement`, { expectedRevision: 1 }],
  ['PUT', `${slotPath(slotId)}/credential`, { expectedRevision: 1, credential }],
  ['POST', `${slotPath(slotId)}/removal`, { expectedRevision: 1 }],
] as const;

test('every account slot operation answers 401 without a credential, and 403 before the body for a principal without its role', async (t) => {
  const { call, added, sent, leakFree, VERA } = await fixture(t);
  const slot = await added();
  const credential = newCredential();
  sent.push(credential);
  for (const path of ['/account-slots', '/projects/project-1/account-slots']) assert.equal((await call('GET', path)).status, 401, path);
  for (const [method, path, body] of COMMANDS(String(slot.slotId), credential)) assert.equal((await call(method, path, {}, body)).status, 401, path);
  assert.deepEqual([(await call('GET', '/account-slots', VERA)).status, (await call('GET', '/account-slots', VERA)).body.details], [403, OWNER_DENIAL]);
  for (const [method, path] of COMMANDS(String(slot.slotId), credential)) {
    const denied = await call(method, path, VERA, { not: 'a valid body' });
    assert.deepEqual([denied.status, denied.body.details], [403, OWNER_DENIAL], path);
  }
  assert.equal((await call('GET', '/projects/project-2/account-slots', VERA)).status, 403, 'a non-member of the project');
  leakFree();
});

test('a cookie command without its CSRF header is 403 csrf-token-invalid and changes nothing', async (t) => {
  const { call, added, sent, tx, leakFree, OWNER } = await fixture(t);
  const slot = await added();
  const credential = newCredential();
  sent.push(credential);
  const before = await tx.accountSlots.list(undefined, 100);
  for (const [method, path, body] of COMMANDS(String(slot.slotId), credential)) {
    const denied = await call(method, path, { cookie: OWNER.cookie! }, body);
    assert.deepEqual([denied.status, (denied.body.details as Record<string, string>).reason], [403, 'csrf-token-invalid'], path);
  }
  assert.deepEqual(await tx.accountSlots.list(undefined, 100), before);
  leakFree();
});

test('an owner adds a Claude Code slot and sees it without its credential or version', async (t) => {
  const { call, added, credentials, leakFree, OWNER } = await fixture(t);
  const slot = await added(['project-1', 'project-2']);
  assert.ok(checkHttpSchema('AccountSlot', slot).ok);
  assert.match(String(slot.slotId), /^s[0-9a-f]{32}$/);
  assert.deepEqual(
    [slot.harnessId, slot.mechanismId, slot.allowedProjects, slot.concurrencyLimit, slot.state, slot.health, slot.revision],
    [CLAUDE_CODE_HARNESS_ID, 'subscription-token', ['project-1', 'project-2'], 4, 'active', 'healthy', 1],
  );
  assert.equal('credentialVersion' in slot || 'credential' in slot, false);
  assert.deepEqual(credentials.storedVersions(slot.slotId as ProviderCredentialId), [1]);
  const page = await call('GET', '/account-slots', OWNER);
  assert.ok(checkHttpSchema('AccountSlotPage', page.body).ok);
  assert.deepEqual(page.body, { slots: [slot] });
  leakFree();
});

test('a project reader sees the project\'s active slots, whether each serves other projects, and never their names', async (t) => {
  const { call, added, tx, leakFree, VERA, OWNER } = await fixture(t);
  const shared = await added(['project-1', 'project-2']);
  const own = slotRecord('s0', ['project-1'], 'other-harness');
  const revoked = slotRecord('s1', ['project-1'], 'other-harness', 'revoked');
  for (const record of [own, revoked]) value(await tx.accountSlots.add(record));
  const view = await call('GET', '/projects/project-1/account-slots', VERA);
  assert.equal(view.status, 200);
  assert.ok(checkHttpSchema('ProjectAccountSlotPage', view.body).ok);
  const slots = view.body.slots as Array<Record<string, unknown>>;
  assert.deepEqual(slots.map((slot) => [slot.slotId, slot.sharedWithOtherProjects]), [['s0', false], [shared.slotId, true]]);
  assert.equal(view.text.includes('project-2'), false, 'no other project is named');
  const other = await call('GET', '/projects/project-2/account-slots', OWNER);
  assert.deepEqual((other.body.slots as Array<Record<string, unknown>>).map((slot) => [slot.slotId, slot.sharedWithOtherProjects]), [[shared.slotId, true]]);
  assert.equal((await call('GET', '/projects/project-9/account-slots', OWNER)).status, 404, 'an unknown project');
  leakFree();
});

test('a second Claude Code slot, another mechanism, another harness, or an unknown project is 400 and stores nothing', async (t) => {
  const { call, added, sent, credentials, tx, leakFree } = await fixture(t);
  await added();
  const before = await tx.accountSlots.list(undefined, 100);
  const refusals: Array<[Record<string, unknown>, Record<string, string>]> = [
    [{}, { harness: CLAUDE_CODE_HARNESS_ID, slotLimit: '1' }],
    [{ mechanismId: 'device-login' }, { harness: CLAUDE_CODE_HARNESS_ID, mechanism: 'device-login' }],
    [{ harnessId: 'other-harness' }, { harness: 'other-harness', mechanism: 'subscription-token' }],
    [{ allowedProjects: ['project-1', 'project-9'] }, { field: 'allowedProjects' }],
  ];
  for (const [changes, details] of refusals) {
    const credential = newCredential();
    sent.push(credential);
    const body = { harnessId: CLAUDE_CODE_HARNESS_ID, mechanismId: 'subscription-token', allowedProjects: ['project-1'], credential, ...changes };
    const refused = await call('POST', '/account-slots', BEARER, body);
    assert.deepEqual([refused.status, refused.body.code, refused.body.details], [400, 'invalid', details], JSON.stringify(changes));
  }
  assert.deepEqual(await tx.accountSlots.list(undefined, 100), before);
  assert.deepEqual((await credentials.listStored('2100-01-01T00:00:00.000Z' as Instant)).length, 1, 'only the added slot keeps a version');
  leakFree();
});

test('a body that its write-only schema refuses names no credential or property it carried', async (t) => {
  const { call, added, sent, leakFree } = await fixture(t);
  const slot = await added();
  const credential = newCredential();
  sent.push(credential);
  const extra = { harnessId: CLAUDE_CODE_HARNESS_ID, mechanismId: 'subscription-token', allowedProjects: ['project-1'], credential, [credential]: credential };
  const long = { harnessId: CLAUDE_CODE_HARNESS_ID, mechanismId: 'subscription-token', allowedProjects: ['project-1'], credential: credential.repeat(2000) };
  const rotation = { expectedRevision: 1, credential, [credential]: 1 };
  for (const [method, path, body] of [['POST', '/account-slots', extra], ['POST', '/account-slots', long], ['PUT', `${slotPath(slot.slotId)}/credential`, rotation]] as const) {
    const refused = await call(method, path, BEARER, body);
    assert.deepEqual([refused.status, refused.body.code], [400, 'invalid'], path);
  }
  leakFree();
});

test('the commands change a slot by its revision, answer a repeat at the current revision unchanged, and refuse a moved one', async (t) => {
  const { call, added, sent, credentials, leakFree, OWNER } = await fixture(t);
  const slot = await added();
  const path = slotPath(slot.slotId);
  const updated = await call('PATCH', path, OWNER, { expectedRevision: 1, concurrencyLimit: 2, allowedProjects: ['project-1', 'project-2'] });
  assert.deepEqual([updated.status, updated.body.concurrencyLimit, updated.body.allowedProjects, updated.body.revision], [200, 2, ['project-1', 'project-2'], 2]);
  const stale = await call('PATCH', path, OWNER, { expectedRevision: 1, concurrencyLimit: 3 });
  assert.deepEqual([stale.status, stale.body.code], [409, 'conflict']);
  const unknownProject = await call('PATCH', path, OWNER, { expectedRevision: 2, allowedProjects: ['project-9'] });
  assert.deepEqual([unknownProject.status, unknownProject.body.details], [400, { field: 'allowedProjects' }]);
  const revoked = await call('POST', `${path}/revocation`, OWNER, { expectedRevision: 2 });
  assert.deepEqual([revoked.status, revoked.body.state, revoked.body.revision], [200, 'revoked', 3]);
  assert.deepEqual((await call('POST', `${path}/revocation`, OWNER, { expectedRevision: 3 })).body, revoked.body, 'a repeat at the current revision');
  assert.equal((await call('POST', `${path}/revocation`, OWNER, { expectedRevision: 2 })).status, 409, 'a repeat at a moved revision');
  assert.equal((await call('PATCH', path, OWNER, { expectedRevision: 3, concurrencyLimit: 5 })).status, 409, 'an update of a revoked slot');
  const credential = newCredential();
  sent.push(credential);
  const rotated = await call('PUT', `${path}/credential`, OWNER, { expectedRevision: 3, credential });
  assert.deepEqual([rotated.status, rotated.body.state, rotated.body.health, rotated.body.revision], [200, 'revoked', 'healthy', 4]);
  assert.deepEqual(credentials.storedVersions(slot.slotId as ProviderCredentialId), [2]);
  const listed = await call('GET', '/account-slots', OWNER);
  assert.equal((listed.body.slots as Array<{ revision: number }>)[0]!.revision, 5, 'the cleanup advanced the revision once more');
  const reinstated = await call('POST', `${path}/reinstatement`, OWNER, { expectedRevision: 5 });
  assert.deepEqual([reinstated.status, reinstated.body.state, reinstated.body.revision], [200, 'active', 6]);
  assert.equal((await call('PUT', `${path}/credential`, OWNER, { expectedRevision: 6, credential })).status, 409, 'a rotation of an active slot');
  const removed = await call('POST', `${path}/removal`, OWNER, { expectedRevision: 6 });
  assert.deepEqual([removed.status, removed.body.state, removed.body.revision], [200, 'removed', 7]);
  assert.deepEqual(credentials.storedVersions(slot.slotId as ProviderCredentialId), []);
  leakFree();
});

test('a removed or unknown slot is 404 for every command, and a bad slot identifier is 400', async (t) => {
  const { call, added, sent, leakFree } = await fixture(t);
  const slot = await added();
  const path = slotPath(slot.slotId);
  assert.equal((await call('POST', `${path}/removal`, BEARER, { expectedRevision: 1 })).status, 200);
  const credential = newCredential();
  sent.push(credential);
  for (const target of [String(slot.slotId), UNKNOWN]) {
    for (const [method, commandPath, body] of COMMANDS(target, credential).slice(1)) {
      const refused = await call(method, commandPath, BEARER, { ...body, expectedRevision: 2 });
      assert.deepEqual([refused.status, refused.body.code], [404, 'not-found'], `${method} ${commandPath}`);
    }
  }
  const bad = await call('POST', `${slotPath('a%20b')}/revocation`, BEARER, { expectedRevision: 1 });
  assert.deepEqual([bad.status, bad.body.details], [400, { field: 'slotId' }]);
  leakFree();
});

test('the lists page by identifier at 100 slots and name the next page', async (t) => {
  const { call, tx, leakFree, OWNER } = await fixture(t);
  for (let index = 0; index < 101; index++) value(await tx.accountSlots.add(slotRecord(`s${String(index).padStart(3, '0')}`, ['project-1'], 'other-harness')));
  const first = await call('GET', '/account-slots', OWNER);
  assert.deepEqual([(first.body.slots as unknown[]).length, first.body.next], [100, 's099']);
  const second = await call('GET', '/account-slots?after=s099', OWNER);
  assert.deepEqual([(second.body.slots as Array<{ slotId: string }>).map((slot) => slot.slotId), 'next' in second.body], [['s100'], false]);
  const project = await call('GET', '/projects/project-1/account-slots?after=s050', OWNER);
  assert.deepEqual([(project.body.slots as unknown[]).length, 'next' in project.body], [50, false]);
  assert.equal((await call('GET', '/account-slots?after=a%20b', OWNER)).status, 400);
  leakFree();
});

// Each way the credential store can refuse, and the answer it must give.
const STORE_REFUSALS = [
  {
    name: 'an unexpected credential store exception', status: 500, code: 'internal', message: 'the slot credential could not be stored',
    rejection: (secret: SlotSecret) => new Error(`the insert of ${secret.reveal()} failed`),
  },
  {
    name: 'an unavailable credential store', status: 503, code: 'unavailable', message: 'the slot credential store is unavailable',
    rejection: () => new SlotCredentialsUnavailable(),
  },
];

// Every store rejects until the returned function restores it.
function breakCredentialStore(credentials: InMemorySlotCredentials, rejection: (secret: SlotSecret) => Error): () => void {
  const working = credentials.store;
  credentials.store = async (_slotId, secret) => {
    throw rejection(secret);
  };
  return () => {
    credentials.store = working;
  };
}

for (const { name, status, code, message, rejection } of STORE_REFUSALS) {
  test(`${name} answers ${status} with fixed text on add and rotate, and no answer or log record holds the credential`, async (t) => {
    const { call, added, sent, credentials, sink, leakFree, OWNER } = await fixture(t);
    const credential = newCredential();
    sent.push(credential);
    const restore = breakCredentialStore(credentials, rejection);
    const body = { harnessId: CLAUDE_CODE_HARNESS_ID, mechanismId: 'subscription-token', allowedProjects: ['project-1'], credential };
    const refusedAdd = await call('POST', '/account-slots', BEARER, body);
    assert.deepEqual([refusedAdd.status, refusedAdd.body], [status, { code, message, details: {} }]);
    restore();
    const slot = await added();
    const path = slotPath(slot.slotId);
    assert.equal((await call('POST', `${path}/revocation`, OWNER, { expectedRevision: 1 })).status, 200);
    breakCredentialStore(credentials, rejection);
    const refusedRotation = await call('PUT', `${path}/credential`, OWNER, { expectedRevision: 2, credential });
    assert.deepEqual([refusedRotation.status, refusedRotation.body], [status, { code, message, details: {} }]);
    assert.deepEqual(credentials.storedVersions(slot.slotId as ProviderCredentialId), [1], 'the rotation stored no version');
    assert.equal(sink.records.filter((record) => record.level === 'error').length, 2, 'both refusals are logged');
    leakFree();
  });
}

test('an update that names an unknown project answers not-found, then conflict, then the state rule first', async (t) => {
  const { call, added, leakFree, OWNER } = await fixture(t);
  const slot = await added();
  const path = slotPath(slot.slotId);
  const unknownProject = (target: string, expectedRevision: number) => call('PATCH', target, OWNER, { expectedRevision, allowedProjects: ['project-9'] });
  const missing = await unknownProject(slotPath(UNKNOWN), 1);
  assert.deepEqual([missing.status, missing.body.code], [404, 'not-found'], 'a missing slot');
  assert.equal((await call('PATCH', path, OWNER, { expectedRevision: 1, concurrencyLimit: 2 })).status, 200);
  const stale = await unknownProject(path, 1);
  assert.deepEqual([stale.status, stale.body.code], [409, 'conflict'], 'a stale revision');
  assert.equal((await call('POST', `${path}/revocation`, OWNER, { expectedRevision: 2 })).status, 200);
  const revoked = await unknownProject(path, 3);
  assert.deepEqual([revoked.status, revoked.body.code], [409, 'conflict'], 'a revoked slot');
  assert.equal((await call('POST', `${path}/removal`, OWNER, { expectedRevision: 3 })).status, 200);
  const removed = await unknownProject(path, 4);
  assert.deepEqual([removed.status, removed.body.code], [404, 'not-found'], 'a removed slot');
  leakFree();
});

test('a store outage is 503 for every list and command, and a bad identifier or cursor is 400 before the store', async (t) => {
  const { call, added, sent, takeStoreDown, leakFree, OWNER } = await fixture(t);
  const slot = await added();
  const credential = newCredential();
  sent.push(credential);
  const commands = COMMANDS(String(slot.slotId), credential);
  for (const [method, path, body] of commands.slice(1)) {
    const refused = await call(method, path.replace(String(slot.slotId), 'a%20b'), OWNER, body);
    assert.deepEqual([refused.status, refused.body.details], [400, { field: 'slotId' }], `${method} ${path}`);
  }
  assert.equal((await call('GET', '/projects/project-1/account-slots?after=a%20b', OWNER)).status, 400);
  takeStoreDown();
  for (const path of ['/account-slots', '/projects/project-1/account-slots']) {
    const refused = await call('GET', path, OWNER);
    assert.deepEqual([refused.status, refused.body.code, refused.body.message], [503, 'unavailable', STORE_OUTAGE.message], path);
  }
  for (const [method, path, body] of commands) {
    const refused = await call(method, path, OWNER, body);
    assert.deepEqual([refused.status, refused.body.code], [503, 'unavailable'], `${method} ${path}`);
  }
  leakFree();
});

test('a minted identifier that is stored already is 500 with fixed text, and its stored version is discarded', async (t) => {
  const { call, sent, tx, credentials, leakFree } = await fixture(t);
  tx.accountSlots.add = async () => err(failure('conflict', 'slot already exists'));
  const credential = newCredential();
  sent.push(credential);
  const refused = await call('POST', '/account-slots', BEARER, { harnessId: CLAUDE_CODE_HARNESS_ID, mechanismId: 'subscription-token', allowedProjects: ['project-1'], credential });
  assert.deepEqual([refused.status, refused.body], [500, { code: 'internal', message: 'the account slot could not be stored', details: {} }]);
  assert.deepEqual(await credentials.listStored('2100-01-01T00:00:00.000Z' as Instant), []);
  leakFree();
});

test('a slot\'s reservation time, cooldown, and usage reach the owner, and only its signals reach a project reader', async (t) => {
  const { call, tx, leakFree, OWNER, VERA } = await fixture(t);
  const cooldown = { until: '2026-11-05T10:00:00.000Z' as Instant, source: 'default' as const };
  const usage = { fraction: 0.5, windowEndsAt: '2026-11-05T12:00:00.000Z' as Instant };
  const lastReservedAt = '2026-11-05T08:00:00.000Z' as Instant;
  value(await tx.accountSlots.add(value(parseAccountSlot({ ...slotRecord('s0', ['project-1'], 'other-harness'), cooldown, usage, lastReservedAt }))));
  const wireSignals = { cooldown: { endsAt: cooldown.until, source: cooldown.source }, usage };
  const owner = await call('GET', '/account-slots', OWNER);
  assert.ok(checkHttpSchema('AccountSlotPage', owner.body).ok);
  assert.deepEqual((owner.body.slots as Array<Record<string, unknown>>).map((slot) => [slot.cooldown, slot.usage, slot.lastReservedAt]), [[wireSignals.cooldown, usage, lastReservedAt]]);
  const reader = await call('GET', '/projects/project-1/account-slots', VERA);
  assert.ok(checkHttpSchema('ProjectAccountSlotPage', reader.body).ok);
  assert.deepEqual((reader.body.slots as Array<Record<string, unknown>>).map((slot) => [slot.cooldown, slot.usage, 'lastReservedAt' in slot]), [[wireSignals.cooldown, usage, false]]);
  leakFree();
});

function slotRecord(text: string, allowedProjects: readonly string[], harness: string, state: AccountSlot['state'] = 'active'): AccountSlot {
  return value(parseAccountSlot({
    id: id('ProviderCredentialId', text) as ProviderCredentialId, harnessId: id('HarnessPluginId', harness) as HarnessPluginId,
    mechanismId: id('SubscriptionMechanismId', 'subscription-token') as SubscriptionMechanismId,
    credentialVersion: value(parseSlotCredentialVersion(1)), allowedProjects: allowedProjects as ProjectId[], concurrencyLimit: 1,
    state, health: 'healthy', revision: FIRST_SLOT_REVISION,
  }));
}

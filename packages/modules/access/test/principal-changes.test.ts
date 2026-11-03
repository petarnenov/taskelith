import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryAccessStore,
  OwnerBootstrapService,
  PrincipalAdministration,
  ProjectSetupService,
  SESSION_LIFETIME,
  SessionService,
  type PrincipalChange,
  type PrincipalId,
} from '@taskelith/access';
import { err, failure } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';
import { countingRandom, DEFAULTS, ManualClock, plainSecrets, recordingHasher, recordingThrottle } from './access-fixtures.ts';

const INVOCATION = { actor: 'root@control-plane-1', reason: 'principal change test' };
const PASSWORD = 'correct horse battery staple';
const SOURCE = '192.0.2.7';

async function setup() {
  const committed: PrincipalChange[][] = [];
  const store = new InMemoryAccessStore({ committed: (changes) => committed.push([...changes]) });
  const clock = new ManualClock();
  const random = countingRandom();
  const hasher = recordingHasher();
  const owner = value(await new OwnerBootstrapService({ store, random, clock }).ensureOwner(INVOCATION)).principalId;
  const admin = new PrincipalAdministration({ store, hasher, random, clock });
  const project = value(await new ProjectSetupService({ store, random, clock }).createProject(owner, { name: 'Alpha', defaults: DEFAULTS }, INVOCATION));
  const bob = value(await admin.createPrincipal(owner, 'bob', INVOCATION)).principalId;
  value(await admin.setPassword(owner, 'bob', PASSWORD, INVOCATION));
  const sessions = new SessionService({ store, hasher, secrets: plainSecrets, random, clock, throttle: recordingThrottle(clock).throttle });
  const since = store.committedChanges().length;
  const recorded = () => store.committedChanges().slice(since);
  return { store, committed, owner, admin, project, bob, sessions, recorded, clock };
}

async function loggedIn(sessions: SessionService) {
  const started = value(await sessions.read(undefined));
  const anonymous = value(await sessions.authenticate(started.cookie!));
  const login = value(await sessions.logIn(anonymous, { loginName: 'bob', password: PASSWORD, sourceAddress: SOURCE }));
  return { cookie: login.cookie!, live: value(await sessions.authenticate(login.cookie!)) };
}

test('the first installation-owner is recorded as a change of its installation role with its creation', async () => {
  const { store, owner } = await setup();
  assert.deepEqual(store.committedChanges()[0], { change: 'roles-changed', principalId: owner });
});

test('an assignment and a removal of a held role each record a change of the member\'s roles in the project', async () => {
  const { admin, owner, project, bob, recorded } = await setup();
  value(await admin.assignProjectMember(owner, { projectId: project.projectId, principalId: bob, role: 'project-viewer' }, INVOCATION));
  value(await admin.removeProjectMember(owner, { projectId: project.projectId, principalId: bob }, INVOCATION));
  const change = { change: 'roles-changed', principalId: bob, projectId: project.projectId };
  assert.deepEqual(recorded(), [change, change]);
});

test('a removal of no role, a refused command, and an unknown project record no change', async () => {
  const { admin, owner, project, bob, recorded } = await setup();
  value(await admin.removeProjectMember(owner, { projectId: project.projectId, principalId: bob }, INVOCATION));
  const denied = await admin.assignProjectMember(bob, { projectId: project.projectId, principalId: bob, role: 'project-maintainer' }, INVOCATION);
  assert.equal(failed(denied).code, 'forbidden');
  const missing = await admin.assignProjectMember(owner, { projectId: `p${'0'.repeat(32)}`, principalId: bob, role: 'project-viewer' }, INVOCATION);
  assert.equal(failed(missing).code, 'not-found');
  assert.deepEqual(recorded(), []);
});

test('a logout, a new password, and a login over a logged-in session each record the end of the principal\'s sessions', async () => {
  const { sessions, admin, owner, bob, recorded } = await setup();
  const first = await loggedIn(sessions);
  assert.deepEqual(recorded(), [], 'a login from an anonymous session ends no principal\'s session');
  value(await sessions.logIn(first.live, { loginName: 'bob', password: PASSWORD, sourceAddress: SOURCE }));
  const second = await loggedIn(sessions);
  value(await sessions.logOut(second.live));
  await loggedIn(sessions);
  value(await admin.setPassword(owner, 'bob', `${PASSWORD} again`, INVOCATION));
  const ended = { change: 'sessions-ended', principalId: bob };
  assert.deepEqual(recorded(), [ended, ended, ended]);
});

test('an authenticated session is live until its expiry, read without renewing it, and not once it ended or expired', async () => {
  const { sessions, clock } = await setup();
  const { live } = await loggedIn(sessions);
  const anonymous = value(await sessions.authenticate(value(await sessions.read(undefined)).cookie!));
  const until = value(await sessions.liveUntil(live.session.idHash));
  assert.deepEqual([until, value(await sessions.liveUntil(anonymous.session.idHash))], [live.session.idleExpiresAt, undefined]);
  clock.advance(SESSION_LIFETIME.renewalMilliseconds * 2);
  assert.equal(value(await sessions.liveUntil(live.session.idHash)), until, 'the read renews nothing');
  value(await sessions.logOut(live));
  assert.equal(value(await sessions.liveUntil(live.session.idHash)), undefined);
  const expiring = await loggedIn(sessions);
  clock.advance(SESSION_LIFETIME.idleMilliseconds);
  assert.equal(value(await sessions.liveUntil(expiring.live.session.idHash)), undefined);
});

test('a rolled-back transaction hands no change to the sink', async () => {
  const { committed, store, bob } = await setup();
  const before = committed.length;
  const rolledBack = await store.transaction(async (tx) => {
    value(await tx.changes.record({ change: 'sessions-ended', principalId: bob as PrincipalId }));
    return err(failure('conflict', 'rolled back'));
  });
  assert.equal(rolledBack.ok, false);
  assert.equal(committed.length, before);
});

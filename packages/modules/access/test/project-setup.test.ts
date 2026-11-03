import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryAccessStore,
  OwnerBootstrapService,
  parseProjectDefaults,
  parseProjectName,
  PrincipalAdministration,
  PROJECT_PAGE_SIZE,
  ProjectSetupService,
  type AccessAuditEvent,
  type PrincipalId,
  type ProjectDefaults,
} from '@taskelith/access';
import type { Result } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';
import { countingRandom, DEFAULTS, ManualClock, recordingHasher } from './access-fixtures.ts';

const INVOCATION = { actor: 'root@control-plane-1', reason: 'project setup test' };

async function setup() {
  const store = new InMemoryAccessStore();
  const clock = new ManualClock();
  const random = countingRandom();
  const owner = value(await new OwnerBootstrapService({ store, random, clock }).ensureOwner(INVOCATION)).principalId;
  const admin = new PrincipalAdministration({ store, hasher: recordingHasher(), random, clock });
  const projects = new ProjectSetupService({ store, random, clock });
  const principal = async (loginName: string) => value(await admin.createPrincipal(owner, loginName, INVOCATION)).principalId;
  const create = async (name = 'Alpha') => value(await projects.createProject(owner, { name, defaults: DEFAULTS }, INVOCATION));
  const assign = (projectId: string, principalId: PrincipalId, role: string) =>
    admin.assignProjectMember(owner, { projectId, principalId, role }, INVOCATION);
  const trail = async () => value(await store.transaction((tx) => tx.audit.trail()));
  return { store, clock, owner, admin, projects, principal, create, assign, trail };
}

test('a new project has its defaults and auto-merge on at revision 1, and no member, its creator included', async () => {
  const { owner, projects, create, trail } = await setup();
  const project = await create();
  assert.match(project.projectId, /^p[0-9a-f]{32}$/);
  assert.deepEqual([project.name, project.revision], ['Alpha', 1]);
  assert.deepEqual(value(await projects.readProject(project.projectId)), project);
  assert.deepEqual(value(await projects.readDefaults(project.projectId)), { defaults: DEFAULTS, revision: 1 });
  assert.deepEqual(value(await projects.readAutoMergeSetting(project.projectId)), { enabled: true, revision: 1 });
  assert.deepEqual(value(await projects.listMembers(project.projectId, undefined)), { items: [] });
  const created = (await trail()).at(-1)!;
  assert.deepEqual([created.kind, created.projectId, created.principalId, created.actor], ['access.project-created', project.projectId, undefined, INVOCATION.actor]);
});

test('only an installation-owner creates a project, and a refused or invalid creation writes nothing', async () => {
  const { projects, principal, trail } = await setup();
  const bob = await principal('bob');
  const before = await trail();
  const denied = failed(await projects.createProject(bob, { name: 'Beta', defaults: DEFAULTS }, INVOCATION));
  assert.deepEqual([denied.code, denied.details], ['forbidden', { reason: 'role-required', requiredRole: 'installation-owner' }]);
  assert.equal(failed(await projects.createProject(bob, { name: '', defaults: DEFAULTS }, INVOCATION)).details.field, 'name');
  const duplicate = { ...DEFAULTS, implementers: ['agent-primary', 'agent-primary'] };
  assert.equal(failed(await projects.createProject(bob, { name: 'Beta', defaults: duplicate }, INVOCATION)).details.field, 'defaults');
  assert.equal(failed(await projects.createProject(bob, { name: 'Beta', defaults: DEFAULTS }, { actor: '', reason: 'x' })).details.field, 'actor');
  assert.deepEqual(await trail(), before);
});

test('an unknown project is not-found on every read', async () => {
  const { projects } = await setup();
  const reads: Array<Promise<Result<unknown>>> = [
    projects.readProject('p-unknown'), projects.readDefaults('p-unknown'), projects.readAutoMergeSetting('p-unknown'),
    projects.listMembers('p-unknown', undefined),
  ];
  for (const read of reads) assert.equal(failed(await read).code, 'not-found');
});

test('the owner lists every project and any other principal only those it is a member of, in pages of 100', async () => {
  const { owner, projects, principal, create, assign } = await setup();
  const bob = await principal('bob');
  const created = [];
  for (let index = 0; index < PROJECT_PAGE_SIZE + 2; index += 1) created.push((await create(`Project ${index}`)).projectId);
  const ids = [...created].sort();
  const first = value(await projects.listProjects(owner, undefined));
  assert.deepEqual([first.items.length, first.next], [PROJECT_PAGE_SIZE, ids[PROJECT_PAGE_SIZE - 1]]);
  const second = value(await projects.listProjects(owner, first.next));
  assert.deepEqual([second.items.map((project) => project.projectId), second.next], [ids.slice(PROJECT_PAGE_SIZE), undefined]);
  assert.deepEqual(value(await projects.listProjects(bob, undefined)), { items: [] });
  value(await assign(ids[3]!, bob, 'project-viewer'));
  value(await assign(ids[1]!, bob, 'project-maintainer'));
  assert.deepEqual(value(await projects.listProjects(bob, undefined)).items.map((project) => project.projectId), [ids[1], ids[3]]);
});

test('a maintainer renames a project and replaces its defaults by compare-and-set; others are refused', async () => {
  const { clock, owner, projects, principal, create, assign, trail } = await setup();
  const { projectId } = await create();
  const [maria, otto] = [await principal('maria'), await principal('otto')];
  value(await assign(projectId, maria, 'project-maintainer'));
  value(await assign(projectId, otto, 'project-operator'));
  for (const actor of [otto, owner]) {
    const denied = failed(await projects.renameProject(actor, projectId, { expectedRevision: 1, value: 'X' }, INVOCATION));
    assert.deepEqual(denied.details, { reason: 'role-required', requiredRole: 'project-maintainer' });
  }
  const renamed = value(await projects.renameProject(maria, projectId, { expectedRevision: 1, value: 'Renamed' }, INVOCATION));
  assert.deepEqual([renamed.name, renamed.revision], ['Renamed', 2]);
  assert.equal(failed(await projects.renameProject(maria, projectId, { expectedRevision: 1, value: 'Stale' }, INVOCATION)).code, 'conflict');
  clock.advance(60_000);
  const changed: ProjectDefaults = { ...DEFAULTS, specApprover: 'project-maintainer', noEligibleSlot: 'reject' };
  const replaced = value(await projects.replaceDefaults(maria, projectId, { expectedRevision: 1, value: changed }, INVOCATION));
  assert.deepEqual(replaced, { defaults: changed, revision: 2, lastChange: { changedBy: maria, changedAt: clock.now() } });
  assert.equal(failed(await projects.replaceDefaults(maria, projectId, { expectedRevision: 1, value: DEFAULTS }, INVOCATION)).code, 'conflict');
  assert.equal(failed(await projects.replaceDefaults(otto, projectId, { expectedRevision: 2, value: DEFAULTS }, INVOCATION)).details.reason, 'role-required');
  assert.deepEqual(value(await projects.readProject(projectId)).revision, 2, 'a defaults change leaves the project revision');
  assert.deepEqual((await trail()).slice(-2).map((event) => event.kind), ['access.project-renamed', 'access.project-defaults-changed']);
});

test('members are assigned by identifier, listed with their login names, and removed, also when no member', async () => {
  const { owner, admin, projects, principal, create, assign, trail } = await setup();
  const { projectId } = await create();
  const bob = await principal('bob');
  const assigned = value(await assign(projectId, bob, 'project-operator'));
  assert.deepEqual(assigned, { principalId: bob, loginName: 'bob', projectId, role: 'project-operator' });
  value(await assign(projectId, bob, 'project-viewer'));
  assert.deepEqual(value(await projects.listMembers(projectId, undefined)), { items: [{ principalId: bob, loginName: 'bob', role: 'project-viewer' }] });
  assert.equal(failed(await assign(projectId, `u${'f'.repeat(32)}` as PrincipalId, 'project-viewer')).code, 'not-found');
  assert.equal(failed(await assign('p-unknown', bob, 'project-viewer')).code, 'not-found');
  assert.equal(failed(await assign(projectId, bob, 'admin')).details.field, 'role');
  value(await admin.removeProjectMember(owner, { projectId, principalId: bob }, INVOCATION));
  value(await admin.removeProjectMember(owner, { projectId, principalId: bob }, INVOCATION));
  value(await admin.removeProjectMember(owner, { projectId, principalId: `u${'f'.repeat(32)}` }, INVOCATION));
  value(await admin.removeProjectMember(owner, { projectId, principalId: 'not-a-principal' }, INVOCATION));
  assert.equal(failed(await admin.removeProjectMember(owner, { projectId: 'p-unknown', principalId: bob }, INVOCATION)).code, 'not-found');
  assert.equal(failed(await admin.removeProjectMember(bob, { projectId, principalId: bob }, INVOCATION)).code, 'forbidden');
  assert.deepEqual(value(await projects.listMembers(projectId, undefined)), { items: [] });
  const kinds = (await trail()).map((event) => event.kind).filter((kind) => kind.startsWith('access.project-role'));
  assert.deepEqual(kinds, ['access.project-role-assigned', 'access.project-role-assigned', 'access.project-role-removed']);
});

test('the administrative role commands refuse a project that does not exist', async () => {
  const { owner, admin, principal } = await setup();
  await principal('bob');
  const refused = failed(await admin.assignProjectRole(owner, { projectId: 'alpha', loginName: 'bob', role: 'project-viewer' }, INVOCATION));
  assert.equal(refused.code, 'not-found');
});

test('the administrative removal accepts an identifier that names no project, so a G2 role stays revocable', async () => {
  const { owner, admin, principal, trail } = await setup();
  const bob = await principal('bob');
  const before = await trail();
  const removed = value(await admin.removeProjectRole(owner, { projectId: 'g2-project', loginName: 'bob' }, INVOCATION));
  assert.deepEqual(removed, { principalId: bob, loginName: 'bob', projectId: 'g2-project' });
  assert.deepEqual(await trail(), before, 'no role was held, so nothing is audited');
});

test('of two concurrent defaults changes one wins with one audit event, and member races end as the trail\'s last event says', async () => {
  const { owner, admin, projects, principal, create, assign, trail } = await setup();
  const { projectId } = await create();
  const [maria, bob] = [await principal('maria'), await principal('bob')];
  value(await assign(projectId, maria, 'project-maintainer'));
  const candidates = [['agent-primary'], ['agent-secondary']].map((implementers) => ({ ...DEFAULTS, implementers }));
  const changes = await Promise.all(candidates.map((defaults) =>
    projects.replaceDefaults(maria, projectId, { expectedRevision: 1, value: defaults }, INVOCATION)));
  assert.deepEqual(changes.map((change) => (change.ok ? 'ok' : change.error.code)).sort(), ['conflict', 'ok']);
  const stored = value(await projects.readDefaults(projectId));
  assert.deepEqual([stored.defaults, stored.revision], [candidates[changes.findIndex((change) => change.ok)], 2]);
  assert.equal((await trail()).filter((event) => event.kind === 'access.project-defaults-changed').length, 1);
  const races = await Promise.all([
    assign(projectId, bob, 'project-operator'), assign(projectId, bob, 'project-viewer'),
    admin.removeProjectMember(owner, { projectId, principalId: bob }, INVOCATION),
  ]);
  for (const race of races) assert.equal(race.ok, true);
  const members = value(await projects.listMembers(projectId, undefined)).items.filter((member) => member.principalId === bob);
  assert.deepEqual(members.map((member) => member.role), roleByTrail(await trail(), projectId, bob));
});

test('members are paged by principal identifier', async () => {
  const { projects, principal, create, assign } = await setup();
  const { projectId } = await create();
  const members: PrincipalId[] = [];
  for (let index = 0; index < PROJECT_PAGE_SIZE + 1; index += 1) {
    const member = await principal(`member-${index}`);
    value(await assign(projectId, member, 'project-viewer'));
    members.push(member);
  }
  const ids = [...members].sort();
  const first = value(await projects.listMembers(projectId, undefined));
  assert.deepEqual([first.items.length, first.next], [PROJECT_PAGE_SIZE, ids[PROJECT_PAGE_SIZE - 1]]);
  assert.deepEqual(value(await projects.listMembers(projectId, first.next)).items.map((member) => member.principalId), [ids[PROJECT_PAGE_SIZE]]);
});

test('a project name of 1024 supplementary characters is created and renamed, and one more is refused', async () => {
  const { projects, principal, create, assign } = await setup();
  const longest = '\u{1F600}'.repeat(1024);
  const { projectId } = await create(longest);
  assert.equal(value(await projects.readProject(projectId)).name, longest);
  const maria = await principal('maria');
  value(await assign(projectId, maria, 'project-maintainer'));
  const renamed = value(await projects.renameProject(maria, projectId, { expectedRevision: 1, value: `${longest.slice(2)}x` }, INVOCATION));
  assert.equal([...renamed.name].length, 1024);
  const tooLong = `${longest}x`;
  assert.equal(failed(await projects.renameProject(maria, projectId, { expectedRevision: 2, value: tooLong }, INVOCATION)).details.field, 'name');
  assert.equal(failed(parseProjectName(tooLong)).details.field, 'name');
});

test('defaults may name plugins that no registry knows; they are stored and read as given', async () => {
  const { owner, projects, principal, assign } = await setup();
  const unregistered: ProjectDefaults = {
    ...DEFAULTS, frameworkPluginId: 'sdlc-unregistered', implementers: ['harness-unregistered'], reviewer: 'reviewer-unregistered',
  };
  const { projectId } = value(await projects.createProject(owner, { name: 'Alpha', defaults: unregistered }, INVOCATION));
  assert.deepEqual(value(await projects.readDefaults(projectId)), { defaults: unregistered, revision: 1 });
  const maria = await principal('maria');
  value(await assign(projectId, maria, 'project-maintainer'));
  const replaced = { ...unregistered, implementers: ['harness-other', 'harness-unregistered'] };
  value(await projects.replaceDefaults(maria, projectId, { expectedRevision: 1, value: replaced }, INVOCATION));
  assert.deepEqual(value(await projects.readDefaults(projectId)).defaults, replaced);
});

test('project names and defaults are checked for callers other than HTTP', () => {
  assert.equal(value(parseProjectName('Alpha')), 'Alpha');
  assert.equal(failed(parseProjectName('a\u0007b')).details.field, 'name');
  assert.equal(failed(parseProjectName('x'.repeat(1025))).code, 'invalid');
  assert.deepEqual(value(parseProjectDefaults(DEFAULTS)), DEFAULTS);
  for (const defaults of [
    { ...DEFAULTS, implementers: [] }, { ...DEFAULTS, implementers: Array.from({ length: 9 }, (_, index) => `h${index}`) },
    { ...DEFAULTS, reviewer: 'has space' }, { ...DEFAULTS, frameworkPluginId: '' },
    { ...DEFAULTS, specApprover: 'council' }, { ...DEFAULTS, noEligibleSlot: 'retry' },
  ]) assert.equal(failed(parseProjectDefaults(defaults as ProjectDefaults)).details.field, 'defaults', JSON.stringify(defaults));
});

test('a minted project identifier of the wrong shape fails the creation and writes nothing', async () => {
  const { store, clock, owner, trail } = await setup();
  const random = { ...countingRandom(), projectId: () => 'not-a-project-id' };
  const before = await trail();
  const refused = failed(await new ProjectSetupService({ store, random, clock }).createProject(owner, { name: 'Alpha', defaults: DEFAULTS }, INVOCATION));
  assert.equal(refused.code, 'internal');
  assert.deepEqual(await trail(), before);
});

// The role that the last role event of the trail leaves, as a list.
function roleByTrail(events: readonly AccessAuditEvent[], projectId: string, principalId: PrincipalId): string[] {
  const last = events.filter((event) => event.projectId === projectId && event.principalId === principalId)
    .filter((event) => event.kind === 'access.project-role-assigned' || event.kind === 'access.project-role-removed').at(-1);
  return last?.kind === 'access.project-role-assigned' && last.role !== undefined ? [last.role] : [];
}

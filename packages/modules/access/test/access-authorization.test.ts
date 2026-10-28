import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCESS_STORE_CONFORMANCE,
  AUTHENTICATED,
  AuthorizationService,
  g2BridgeRequirement,
  InMemoryAccessStore,
  OperatorAuthentication,
  OWNER_ONLY,
  OwnerBootstrapService,
  projectRead,
  projectRequirement,
  requiredRoleOf,
  RoleApprovers,
  type LoginName,
  type PrincipalId,
  type ProjectRole,
} from '@taskelith/access';
import { err, failure, ok } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';
import { countingRandom, ManualClock } from './access-fixtures.ts';

for (const conformance of ACCESS_STORE_CONFORMANCE) {
  test(`in-memory access store: ${conformance.name}`, async () => {
    assert.deepEqual(await conformance.check(new InMemoryAccessStore()), []);
  });
}

test('an in-memory transaction that throws writes nothing and the next one runs', async () => {
  const store = new InMemoryAccessStore();
  const principal = { principalId: `u${'a'.repeat(32)}` as PrincipalId, kind: 'operator' as const, loginName: 'alice' as LoginName, createdAt: new ManualClock().now() };
  await assert.rejects(store.transaction(async (tx) => {
    await tx.principals.add(principal);
    throw new Error('defect');
  }), /defect/);
  assert.equal(value(await store.transaction((tx) => tx.principals.get(principal.principalId))), undefined);
});

const ALICE = `u${'a'.repeat(32)}` as PrincipalId;
const OWNER = `u${'0'.repeat(32)}` as PrincipalId;

async function storeWith(roles: Record<string, ProjectRole>, owner = true): Promise<InMemoryAccessStore> {
  const store = new InMemoryAccessStore();
  const createdAt = new ManualClock().now();
  value(await store.transaction(async (tx) => {
    value(await tx.principals.add({ principalId: ALICE, kind: 'operator', loginName: 'alice' as LoginName, createdAt }));
    value(await tx.principals.add({ principalId: OWNER, kind: 'operator', loginName: 'owner' as LoginName, createdAt }));
    if (owner) value(await tx.principals.grantInstallationOwner(OWNER, createdAt));
    for (const [projectId, role] of Object.entries(roles)) value(await tx.projectRoles.assign(projectId, ALICE, role, createdAt));
    return ok(undefined);
  }));
  return store;
}

const denial = (role: string) => failure('forbidden', `the operation requires the role ${role}`, { reason: 'role-required', requiredRole: role });

test('project roles include the roles below them and no other project', async () => {
  const authorization = new AuthorizationService(await storeWith({ 'project-1': 'project-operator' }));
  assert.ok((await authorization.authorize(ALICE, projectRequirement('project-1', 'project-viewer'))).ok);
  assert.ok((await authorization.authorize(ALICE, projectRequirement('project-1', 'project-operator'))).ok);
  assert.deepEqual(failed(await authorization.authorize(ALICE, projectRequirement('project-1', 'project-maintainer'))), denial('project-maintainer'));
  assert.deepEqual(failed(await authorization.authorize(ALICE, projectRead('project-2'))), denial('project-viewer'));
  assert.ok((await authorization.authorize(ALICE, AUTHENTICATED)).ok);
  assert.deepEqual(failed(await authorization.authorize(ALICE, OWNER_ONLY)), denial('installation-owner'));
  assert.ok((await authorization.authorize(OWNER, OWNER_ONLY)).ok);
});

test('an owner passes section 3 reads and the G2 bridge, never a project mutation', async () => {
  const authorization = new AuthorizationService(await storeWith({}));
  assert.ok((await authorization.authorize(OWNER, projectRead('project-1'))).ok);
  assert.ok((await authorization.authorize(OWNER, projectRead(undefined))).ok, 'an owner may learn 404');
  assert.ok((await authorization.authorize(OWNER, g2BridgeRequirement('project-1', 'project-operator'))).ok, 'the temporary G2 bridge');
  assert.deepEqual(failed(await authorization.authorize(OWNER, projectRequirement('project-1', 'project-maintainer'))), denial('project-maintainer'));
  assert.deepEqual(failed(await authorization.authorize(ALICE, g2BridgeRequirement('project-1', 'project-operator'))), denial('project-operator'));
});

test('a caller without the role gets the same denial for a missing resource as for a foreign one', async () => {
  const authorization = new AuthorizationService(await storeWith({ 'project-1': 'project-maintainer' }));
  const foreign = failed(await authorization.authorize(ALICE, projectRead('project-2')));
  const missing = failed(await authorization.authorize(ALICE, projectRead(undefined)));
  assert.deepEqual(missing, foreign);
  assert.equal(requiredRoleOf(AUTHENTICATED), undefined);
});

test('a removed role applies to the next request', async () => {
  const store = await storeWith({ 'project-1': 'project-maintainer' });
  const authorization = new AuthorizationService(store);
  assert.ok((await authorization.authorize(ALICE, projectRequirement('project-1', 'project-maintainer'))).ok);
  value(await store.transaction((tx) => tx.projectRoles.remove('project-1', ALICE)));
  assert.deepEqual(failed(await authorization.authorize(ALICE, projectRequirement('project-1', 'project-maintainer'))), denial('project-maintainer'));
});

test('a store failure is passed on, not taken for a denial', async () => {
  const broken = { transaction: async () => err(failure('unavailable', 'the store is down')) };
  assert.equal(failed(await new AuthorizationService(broken).authorize(ALICE, OWNER_ONLY)).code, 'unavailable');
});

test('approvals follow the decision body: only a maintainer of the project approves', async () => {
  const store = await storeWith({ 'project-1': 'project-maintainer', 'project-2': 'project-operator' });
  const approvers = new RoleApprovers(store);
  const approval = (projectId: string, decisionBody: 'project-maintainer' | 'delegated-reviewer') => ({ projectId, gateKind: 'spec', decisionBody });
  assert.ok((await approvers.authorizeApproval(ALICE, approval('project-1', 'project-maintainer'))).ok);
  assert.deepEqual(failed(await approvers.authorizeApproval(ALICE, approval('project-2', 'project-maintainer'))), denial('project-maintainer'));
  assert.deepEqual(failed(await approvers.authorizeApproval(OWNER, approval('project-1', 'project-maintainer'))), denial('project-maintainer'));
  const delegated = failed(await approvers.authorizeApproval(ALICE, approval('project-1', 'delegated-reviewer')));
  assert.deepEqual([delegated.code, delegated.details.reason], ['forbidden', 'role-required']);
});

const INVOCATION = { actor: 'control-plane', reason: 'bootstrap owner from the G2 operator credential' };

test('the owner is created once with its role, binding, and one audit event, also under concurrency', async () => {
  const store = new InMemoryAccessStore();
  const service = new OwnerBootstrapService({ store, random: countingRandom(), clock: new ManualClock() });
  const results = await Promise.all([service.ensureOwner(INVOCATION), service.ensureOwner(INVOCATION)]);
  assert.deepEqual(results.map((result) => value(result).created).sort(), [false, true]);
  const owner = value(results[0]!).principalId;
  assert.equal(value(results[1]!).principalId, owner);
  assert.deepEqual(value(await service.ensureOwner(INVOCATION)), { principalId: owner, created: false });
  const trail = value(await store.transaction((tx) => tx.audit.trail()));
  assert.deepEqual(trail.map(({ kind, principalId, role, actor, reason }) => ({ kind, principalId, role, actor, reason })), [
    { kind: 'access.owner-created', principalId: owner, role: 'installation-owner', ...INVOCATION },
  ]);
  const principal = value(await store.transaction((tx) => tx.principals.get(owner)));
  assert.deepEqual([principal?.loginName, principal?.kind, principal?.passwordHash], ['owner', 'operator', undefined]);
  assert.equal(value(await store.transaction((tx) => tx.principals.isInstallationOwner(owner))), true);
});

test('a bootstrap with an invalid invocation, identifier, or store writes nothing', async () => {
  const store = new InMemoryAccessStore();
  const clock = new ManualClock();
  assert.equal(failed(await new OwnerBootstrapService({ store, random: countingRandom(), clock }).ensureOwner({ actor: ' ', reason: 'x' })).code, 'invalid');
  const badRandom = { sessionToken: () => 'x', principalId: () => 'not-an-id' };
  assert.equal(failed(await new OwnerBootstrapService({ store, random: badRandom, clock }).ensureOwner(INVOCATION)).code, 'invalid');
  const taken = new InMemoryAccessStore();
  value(await taken.transaction((tx) => tx.principals.add({ principalId: ALICE, kind: 'operator', loginName: 'owner' as LoginName, createdAt: clock.now() })));
  assert.equal(failed(await new OwnerBootstrapService({ store: taken, random: countingRandom(), clock }).ensureOwner(INVOCATION)).code, 'conflict');
  const down = { transaction: async () => err(failure('unavailable', 'down')) };
  assert.equal(failed(await new OwnerBootstrapService({ store: down, random: countingRandom(), clock }).ensureOwner(INVOCATION)).code, 'unavailable');
});

test('the operator bearer authenticates the bound owner, and nothing before it is bound', async () => {
  const store = new InMemoryAccessStore();
  const credentials = { authenticate: async (secret: string) => (secret === 'tkop_right' ? ok(undefined) : err(failure('forbidden', 'not valid'))) };
  const bearer = new OperatorAuthentication(credentials, store);
  assert.equal(failed(await bearer.authenticate('tkop_right')).code, 'unavailable');
  const owner = value(await new OwnerBootstrapService({ store, random: countingRandom(), clock: new ManualClock() }).ensureOwner(INVOCATION));
  assert.equal(value(await bearer.authenticate('tkop_right')), owner.principalId);
  assert.equal(failed(await bearer.authenticate('tkop_wrong')).code, 'forbidden');
  const down = new OperatorAuthentication(credentials, { transaction: async () => err(failure('unavailable', 'down')) });
  assert.equal(failed(await down.authenticate('tkop_right')).code, 'unavailable');
});

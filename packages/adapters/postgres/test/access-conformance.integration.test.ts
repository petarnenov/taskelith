import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import {
  ACCESS_STORE_CONFORMANCE,
  LoginThrottle,
  OwnerBootstrapService,
  PrincipalAdministration,
  ProjectSetupService,
  SessionService,
  type AccessAuditEvent,
  type AccessStore,
  type AccessTransaction,
  type LoginName,
  type PasswordHash,
  type PasswordHasher,
  type PrincipalId,
} from '@taskelith/access';
import { instantFromEpochMilliseconds, ok } from '@taskelith/kernel';
import { PostgresAccessStore, PostgresDatabase } from '@taskelith/postgres';
import { NodeSecrets } from '@taskelith/secrets';
import { failed, value } from '@taskelith/testing';
import { rendezvous } from './gated-transactions.ts';
import { createMigratedDatabase, query, truncateAll } from './test-database.ts';

const url = await createMigratedDatabase();
const database = new PostgresDatabase(url);
after(() => database.close());

for (const conformance of ACCESS_STORE_CONFORMANCE) {
  test(`PostgreSQL access store: ${conformance.name}`, { concurrency: false }, async () => {
    await truncateAll(url);
    assert.deepEqual(await conformance.check(new PostgresAccessStore(database)), []);
  });
}

test('two control-plane starts that create the owner at once create one principal and audit the repeat', { concurrency: false }, async () => {
  await truncateAll(url);
  const other = new PostgresDatabase(url);
  try {
    const clock = { now: () => value(instantFromEpochMilliseconds(Date.now())) };
    const invocation = { actor: 'control-plane', reason: 'bootstrap owner from the G2 operator credential' };
    const starts = [database, other].map((pool) => new OwnerBootstrapService({ store: new PostgresAccessStore(pool), random: new NodeSecrets(), clock }));
    const results = await Promise.all(starts.map((service) => service.ensureOwner(invocation)));
    assert.deepEqual(results.map((result) => value(result).created).sort(), [false, true]);
    assert.equal(value(results[0]!).principalId, value(results[1]!).principalId);
    assert.deepEqual(await query(url, 'SELECT login_name FROM principals'), [{ login_name: 'owner' }]);
    const kinds = await query(url, 'SELECT kind, principal_id FROM access_audit_events ORDER BY position');
    const owner = value(results[0]!).principalId;
    assert.deepEqual(kinds, [
      { kind: 'access.owner-created', principal_id: owner }, { kind: 'access.owner-bootstrap-repeated', principal_id: owner },
    ]);
    assert.deepEqual(await query(url, 'SELECT role FROM installation_roles'), [{ role: 'installation-owner' }]);
  } finally {
    await other.close();
  }
});

const clock = { now: () => value(instantFromEpochMilliseconds(Date.now())) };
const ALICE = `u${'a'.repeat(32)}` as PrincipalId;

// A stand-in hasher: the hash of a password is the password with a prefix.
const plainHasher: PasswordHasher = {
  hash: async (password) => ok(`plain:${password}` as PasswordHash),
  verify: async (password, stored) => ok({ matches: stored === `plain:${password}`, rehashDue: false }),
};

// Holds the first principal read of any transaction until `open` is called.
function gatedStore(inner: AccessStore) {
  let open!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => { open = resolve; });
  const waiting = new Promise<void>((resolve) => { reached = resolve; });
  let armed = true;
  const gatedGet = (principals: AccessTransaction['principals']) => async (principalId: PrincipalId) => {
    const read = await principals.get(principalId);
    if (armed) {
      armed = false;
      reached();
      await gate;
    }
    return read;
  };
  const store: AccessStore = {
    transaction: (work) => inner.transaction((tx) => {
      const principals = new Proxy(tx.principals, {
        get: (target, key) => (key === 'get' ? gatedGet(target) : Reflect.get(target, key).bind(target)),
      });
      return work(new Proxy(tx, { get: (target, key) => (key === 'principals' ? principals : Reflect.get(target, key)) }));
    }),
  };
  return { store, waiting, open };
}

test('a password change committed during a login rotation on PostgreSQL refuses the login', { concurrency: false }, async () => {
  await truncateAll(url);
  const other = new PostgresDatabase(url);
  try {
    const password = 'correct horse battery staple';
    value(await new PostgresAccessStore(database).transaction((tx) => tx.principals.add({
      principalId: ALICE, kind: 'operator', loginName: 'alice' as LoginName, passwordHash: `plain:${password}` as PasswordHash, createdAt: clock.now(),
    })));
    const { store, waiting, open } = gatedStore(new PostgresAccessStore(database));
    const throttle = new LoginThrottle({ clock, sleep: async () => undefined });
    const secrets = new NodeSecrets();
    const sessions = new SessionService({ store, hasher: plainHasher, secrets, random: secrets, clock, throttle });
    const started = value(await sessions.start());
    const live = value(await sessions.authenticate(started.cookie!));
    const login = sessions.logIn(live, { loginName: 'alice', password, sourceAddress: '192.0.2.7' });
    await waiting;
    const changed = 'plain:another long passphrase' as PasswordHash;
    value(await new PostgresAccessStore(other).transaction(async (tx) => {
      value(await tx.principals.setPasswordHash(ALICE, changed));
      return tx.sessions.endAllOf(ALICE, clock.now());
    }));
    open();
    assert.equal(failed(await login).details.reason, 'login-failed');
    assert.deepEqual(await query(url, 'SELECT password_hash FROM principals'), [{ password_hash: changed }], 'the new hash stays');
    assert.deepEqual(await query(url, 'SELECT principal_id FROM browser_sessions'), [{ principal_id: null }], 'no session logged in');
  } finally {
    await other.close();
  }
});

test('a principal row of an unknown kind is refused, not read as an operator', { concurrency: false }, async () => {
  await truncateAll(url);
  await query(url, 'ALTER TABLE principals DROP CONSTRAINT principals_kind_check');
  try {
    await query(url, `INSERT INTO principals (principal_id, kind, login_name, created_at) VALUES ($1, 'delegate', 'robot', now())`, [ALICE]);
    const store = new PostgresAccessStore(database);
    assert.equal(failed(await store.transaction((tx) => tx.principals.get(ALICE))).code, 'internal');
    assert.equal(failed(await store.transaction((tx) => tx.principals.findByLoginName('robot' as LoginName))).code, 'internal');
  } finally {
    await query(url, 'DELETE FROM principals');
    await query(url, `ALTER TABLE principals ADD CONSTRAINT principals_kind_check CHECK (kind IN ('operator'))`);
  }
});

// The first attempt of each transaction waits after its owner read until
// every racer has read, so the racers' transactions overlap.
function overlapping(inner: AccessStore, arrive: () => Promise<void>): { store: AccessStore; retried: () => boolean } {
  let retried = false;
  const store: AccessStore = {
    transaction: (work) => {
      let runs = 0;
      return inner.transaction((tx) => {
        runs += 1;
        retried ||= runs > 1;
        if (runs > 1) return work(tx);
        let waited = false;
        const ownerRead = async (principalId: PrincipalId) => {
          const read = await tx.principals.isInstallationOwner(principalId);
          if (!waited) {
            waited = true;
            await arrive();
          }
          return read;
        };
        const principals = new Proxy(tx.principals, {
          get: (target, key) => (key === 'isInstallationOwner' ? ownerRead : Reflect.get(target, key).bind(target)),
        });
        return work(new Proxy(tx, { get: (target, key) => (key === 'principals' ? principals : Reflect.get(target, key)) }));
      });
    },
  };
  return { store, retried: () => retried };
}

const INVOCATION = { actor: 'root@control-plane-1', reason: 'overlapping project commands' };
const DEFAULTS = Object.freeze({
  frameworkPluginId: 'sdlc-openspec', implementers: ['agent-primary'], reviewer: 'agent-secondary',
  specApprover: 'project-maintainer', noEligibleSlot: 'wait',
} as const);

async function projectWithMembers() {
  const store = new PostgresAccessStore(database);
  const secrets = new NodeSecrets();
  const owner = value(await new OwnerBootstrapService({ store, random: secrets, clock }).ensureOwner(INVOCATION)).principalId;
  const admin = new PrincipalAdministration({ store, hasher: plainHasher, random: secrets, clock });
  const setup = new ProjectSetupService({ store, random: secrets, clock });
  const { projectId } = value(await setup.createProject(owner, { name: 'Alpha', defaults: DEFAULTS }, INVOCATION));
  const [maria, bob] = [value(await admin.createPrincipal(owner, 'maria', INVOCATION)), value(await admin.createPrincipal(owner, 'bob', INVOCATION))];
  value(await admin.assignProjectMember(owner, { projectId, principalId: maria.principalId, role: 'project-maintainer' }, INVOCATION));
  return { owner, projectId, maria: maria.principalId, bob: bob.principalId };
}

function racers() {
  const { store, retried } = overlapping(new PostgresAccessStore(database), rendezvous(2));
  const secrets = new NodeSecrets();
  return {
    admin: new PrincipalAdministration({ store, hasher: plainHasher, random: secrets, clock }),
    setup: new ProjectSetupService({ store, random: secrets, clock }),
    retried,
  };
}

async function auditTrail(): Promise<readonly AccessAuditEvent[]> {
  return value(await new PostgresAccessStore(database).transaction((tx) => tx.audit.trail()));
}

// The role that the last role event of the trail leaves, as a list.
function roleByTrail(events: readonly AccessAuditEvent[], projectId: string, principalId: PrincipalId): string[] {
  const last = events.filter((event) => event.projectId === projectId && event.principalId === principalId)
    .filter((event) => event.kind === 'access.project-role-assigned' || event.kind === 'access.project-role-removed').at(-1);
  return last?.kind === 'access.project-role-assigned' && last.role !== undefined ? [last.role] : [];
}

async function rolesOf(projectId: string, principalId: PrincipalId): Promise<string[]> {
  const rows = await query(url, 'SELECT role FROM project_roles WHERE project_id = $1 AND principal_id = $2', [projectId, principalId]);
  return rows.map((row) => String(row.role));
}

test('of two overlapping defaults changes on PostgreSQL one wins, the other is a conflict after its retry, with one audit event', { concurrency: false }, async () => {
  await truncateAll(url);
  const { projectId, maria } = await projectWithMembers();
  const { setup, retried } = racers();
  const candidates = [['agent-primary'], ['agent-secondary']].map((implementers) => ({ ...DEFAULTS, implementers }));
  const changes = await Promise.all(candidates.map((defaults) =>
    setup.replaceDefaults(maria, projectId, { expectedRevision: 1, value: defaults }, INVOCATION)));
  assert.equal(retried(), true, 'the transactions overlapped');
  assert.deepEqual(changes.map((change) => (change.ok ? 'ok' : change.error.code)).sort(), ['conflict', 'ok']);
  const winner = candidates[changes.findIndex((change) => change.ok)]!;
  assert.deepEqual(await query(url, 'SELECT implementers, revision FROM project_defaults'), [{ implementers: winner.implementers, revision: 2 }]);
  assert.equal((await auditTrail()).filter((event) => event.kind === 'access.project-defaults-changed').length, 1);
});

test('two overlapping assignments of one member on PostgreSQL both succeed, and the role is the last audit event\'s', { concurrency: false }, async () => {
  await truncateAll(url);
  const { owner, projectId, bob } = await projectWithMembers();
  const { admin, retried } = racers();
  const assigned = await Promise.all(['project-operator', 'project-viewer'].map((role) =>
    admin.assignProjectMember(owner, { projectId, principalId: bob, role }, INVOCATION)));
  assert.equal(retried(), true, 'the transactions overlapped');
  for (const assignment of assigned) value(assignment);
  const roles = await rolesOf(projectId, bob);
  assert.equal(roles.length, 1);
  assert.deepEqual(roles, roleByTrail(await auditTrail(), projectId, bob));
});

test('an assignment overlapping a removal of one member on PostgreSQL ends as the last audit event says', { concurrency: false }, async () => {
  await truncateAll(url);
  const { owner, projectId, bob } = await projectWithMembers();
  value(await new PrincipalAdministration({ store: new PostgresAccessStore(database), hasher: plainHasher, random: new NodeSecrets(), clock })
    .assignProjectMember(owner, { projectId, principalId: bob, role: 'project-viewer' }, INVOCATION));
  const { admin } = racers();
  const target = { projectId, principalId: bob };
  const [assigned, removed] = await Promise.all([
    admin.assignProjectMember(owner, { ...target, role: 'project-operator' }, INVOCATION), admin.removeProjectMember(owner, target, INVOCATION),
  ]);
  value(assigned);
  value(removed);
  const trail = await auditTrail();
  assert.deepEqual(await rolesOf(projectId, bob), roleByTrail(trail, projectId, bob));
  const removal = trail.find((event) => event.kind === 'access.project-role-removed');
  assert.ok(removal !== undefined, 'a role was held, so the removal is audited');
});

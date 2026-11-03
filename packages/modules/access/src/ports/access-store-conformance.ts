import { err, failure, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import { expectCode, expectOneWinner, expectRead, expectSame, expectSuccess, type ConformanceCase, type ProjectId } from '@taskelith/sdlc';
import type { AccessAuditEvent } from '../domain/access-audit.js';
import type { LoginName, PasswordHash, Principal, PrincipalId } from '../domain/principal.js';
import type { Project, ProjectDefaults } from '../domain/project.js';
import type { SecretHash } from '../domain/secret-hash.js';
import type { StoredSession } from '../domain/session.js';
import type { AccessStore, AccessTransaction, ProjectQuery } from './access-store.js';

// The shared suite for AccessStore; each case gets an empty store.

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`conformance fixture: ${result.error.message}`);
  return result.value;
}

const at = (minute: number): Instant => must(parseInstant(`2026-10-28T09:${String(minute).padStart(2, '0')}:00.000Z`));
const id = (digit: string) => `u${digit.repeat(32)}` as PrincipalId;
const pid = (digit: string) => `p${digit.repeat(32)}` as ProjectId;

const DEFAULTS: ProjectDefaults = Object.freeze({
  frameworkPluginId: 'sdlc-openspec', implementers: Object.freeze(['agent-primary', 'agent-secondary']), reviewer: 'agent-secondary',
  specApprover: 'project-maintainer', noEligibleSlot: 'wait',
});

function project(digit: string): Project {
  return Object.freeze({ projectId: pid(digit), name: `Project ${digit}`, createdAt: at(0), revision: 1 });
}

function principal(digit: string, loginName: string): Principal {
  return Object.freeze({ principalId: id(digit), kind: 'operator', loginName: loginName as LoginName, createdAt: at(0) });
}

function session(hash: string, principalId?: PrincipalId, minute = 0): StoredSession {
  return Object.freeze({
    idHash: hash as SecretHash, csrfToken: `csrf-${hash}`, createdAt: at(minute), lastSeenAt: at(minute),
    idleExpiresAt: at(minute + 10), absoluteExpiresAt: at(minute + 20),
    ...(principalId === undefined ? {} : { principalId, authenticatedAt: at(minute) }),
  });
}

const run = <T>(store: AccessStore, work: (tx: AccessTransaction) => Promise<Result<T>>) => store.transaction(work);

export const ACCESS_STORE_CONFORMANCE: readonly ConformanceCase<AccessStore>[] = Object.freeze([
  {
    name: 'principals are found by identifier and login name, which are unique',
    async check(store) {
      const problems: string[] = [];
      const alice = principal('a', 'alice');
      expectSuccess(problems, 'add', await run(store, (tx) => tx.principals.add(alice)));
      expectCode(problems, 'same id', await run(store, (tx) => tx.principals.add({ ...alice, loginName: 'other' as LoginName })), 'conflict');
      expectCode(problems, 'same name', await run(store, (tx) => tx.principals.add(principal('b', 'alice'))), 'conflict');
      expectSame(problems, 'get', must(await run(store, (tx) => tx.principals.get(alice.principalId))), alice);
      expectSame(problems, 'by name', must(await run(store, (tx) => tx.principals.findByLoginName(alice.loginName))), alice);
      expectSame(problems, 'unknown', must(await run(store, (tx) => tx.principals.findByLoginName('bob' as LoginName))), undefined);
      const hash = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$dGFn' as PasswordHash;
      expectSuccess(problems, 'set hash', await run(store, (tx) => tx.principals.setPasswordHash(alice.principalId, hash)));
      expectSame(problems, 'hash', must(await run(store, (tx) => tx.principals.get(alice.principalId)))?.passwordHash, hash);
      expectCode(problems, 'hash of unknown', await run(store, (tx) => tx.principals.setPasswordHash(id('c'), hash)), 'not-found');
      return problems;
    },
  },
  {
    name: 'one principal is bound to the operator credential and owners are granted once',
    async check(store) {
      const problems: string[] = [];
      must(await run(store, async (tx) => {
        must(await tx.principals.add(principal('a', 'owner')));
        return tx.principals.add(principal('b', 'second'));
      }));
      expectSame(problems, 'unbound', must(await run(store, (tx) => tx.principals.operatorPrincipal())), undefined);
      expectCode(problems, 'bind unknown', await run(store, (tx) => tx.principals.bindOperator(id('c'))), 'not-found');
      const results = await Promise.all([id('a'), id('b')].map((principalId) => run(store, (tx) => tx.principals.bindOperator(principalId))));
      const winner = expectOneWinner(problems, 'concurrent binds', results);
      const bound = must(await run(store, (tx) => tx.principals.operatorPrincipal()));
      expectSame(problems, 'bound', bound, winner === undefined ? undefined : [id('a'), id('b')][winner]);
      expectSuccess(problems, 'grant', await run(store, (tx) => tx.principals.grantInstallationOwner(id('a'), at(1))));
      expectSuccess(problems, 'grant again', await run(store, (tx) => tx.principals.grantInstallationOwner(id('a'), at(2))));
      expectCode(problems, 'grant unknown', await run(store, (tx) => tx.principals.grantInstallationOwner(id('c'), at(1))), 'not-found');
      expectSame(problems, 'owner', must(await run(store, (tx) => tx.principals.isInstallationOwner(id('a')))), true);
      expectSame(problems, 'not owner', must(await run(store, (tx) => tx.principals.isInstallationOwner(id('b')))), false);
      return problems;
    },
  },
  {
    name: 'a principal holds at most one role per project, replaced by an assignment',
    async check(store) {
      const problems: string[] = [];
      must(await run(store, async (tx) => {
        must(await tx.principals.add(principal('a', 'alice')));
        must(await tx.projects.add(project('1'), DEFAULTS));
        return tx.projects.add(project('2'), DEFAULTS);
      }));
      const alice = id('a');
      const [one, two] = [pid('1'), pid('2')];
      expectSuccess(problems, 'assign', await run(store, (tx) => tx.projectRoles.assign(two, alice, 'project-viewer', at(1))));
      expectSuccess(problems, 'replace', await run(store, (tx) => tx.projectRoles.assign(two, alice, 'project-operator', at(2))));
      expectSuccess(problems, 'other', await run(store, (tx) => tx.projectRoles.assign(one, alice, 'project-maintainer', at(2))));
      expectCode(problems, 'unknown', await run(store, (tx) => tx.projectRoles.assign(one, id('c'), 'project-viewer', at(2))), 'not-found');
      expectCode(problems, 'no project', await run(store, (tx) => tx.projectRoles.assign(pid('3'), alice, 'project-viewer', at(2))), 'not-found');
      expectSame(problems, 'role', must(await run(store, (tx) => tx.projectRoles.roleOf(two, alice))), 'project-operator');
      expectSame(problems, 'projects', must(await run(store, (tx) => tx.projectRoles.projectsOf(alice))), [
        { projectId: one, role: 'project-maintainer' }, { projectId: two, role: 'project-operator' },
      ]);
      expectSame(problems, 'remove', must(await run(store, (tx) => tx.projectRoles.remove(two, alice))), true);
      expectSame(problems, 'remove again', must(await run(store, (tx) => tx.projectRoles.remove(two, alice))), false);
      expectSame(problems, 'removed', must(await run(store, (tx) => tx.projectRoles.roleOf(two, alice))), undefined);
      return problems;
    },
  },
  {
    name: 'a project starts with its defaults and auto-merge on, at revision 1',
    async check(store) {
      const problems: string[] = [];
      expectSuccess(problems, 'add', await run(store, (tx) => tx.projects.add(project('1'), DEFAULTS)));
      expectCode(problems, 'taken', await run(store, (tx) => tx.projects.add({ ...project('1'), name: 'Other' }, DEFAULTS)), 'conflict');
      expectSame(problems, 'get', must(await run(store, (tx) => tx.projects.get(pid('1')))), project('1'));
      expectSame(problems, 'unknown', must(await run(store, (tx) => tx.projects.get(pid('2')))), undefined);
      expectSame(problems, 'defaults', must(await run(store, (tx) => tx.projects.defaults(pid('1')))), { defaults: DEFAULTS, revision: 1 });
      expectSame(problems, 'auto-merge', must(await run(store, (tx) => tx.projects.autoMergeSetting(pid('1')))), { enabled: true, revision: 1 });
      expectSame(problems, 'no defaults', must(await run(store, (tx) => tx.projects.defaults(pid('2')))), undefined);
      expectSame(problems, 'no setting', must(await run(store, (tx) => tx.projects.autoMergeSetting(pid('2')))), undefined);
      return problems;
    },
  },
  {
    name: 'projects are paged in identifier code-unit order, all or those of a member',
    async check(store) {
      const problems: string[] = [];
      must(await run(store, async (tx) => {
        must(await tx.principals.add(principal('a', 'alice')));
        for (const digit of ['c', '1', 'a', '3']) must(await tx.projects.add(project(digit), DEFAULTS));
        must(await tx.projectRoles.assign(pid('c'), id('a'), 'project-viewer', at(1)));
        return tx.projectRoles.assign(pid('1'), id('a'), 'project-operator', at(1));
      }));
      const ids = async (query: ProjectQuery) => must(await run(store, (tx) => tx.projects.page(query))).map((found) => found.projectId);
      expectSame(problems, 'all', await ids({ limit: 10 }), [pid('1'), pid('3'), pid('a'), pid('c')]);
      expectSame(problems, 'limit', await ids({ limit: 2 }), [pid('1'), pid('3')]);
      expectSame(problems, 'after', await ids({ limit: 10, after: pid('3') }), [pid('a'), pid('c')]);
      expectSame(problems, 'member', await ids({ limit: 10, memberOf: id('a') }), [pid('1'), pid('c')]);
      expectSame(problems, 'member after', await ids({ limit: 10, memberOf: id('a'), after: pid('1') }), [pid('c')]);
      expectSame(problems, 'no member', await ids({ limit: 10, memberOf: id('b') }), []);
      return problems;
    },
  },
  {
    name: 'a rename and a defaults change compare and set their own revisions',
    async check(store) {
      const problems: string[] = [];
      must(await run(store, async (tx) => {
        must(await tx.principals.add(principal('a', 'alice')));
        return tx.projects.add(project('1'), DEFAULTS);
      }));
      const renamed = await run(store, (tx) => tx.projects.rename(pid('1'), 1, 'Renamed'));
      expectRead(problems, 'renamed', renamed, { ...project('1'), name: 'Renamed', revision: 2 });
      expectCode(problems, 'stale rename', await run(store, (tx) => tx.projects.rename(pid('1'), 1, 'Again')), 'conflict');
      expectCode(problems, 'rename unknown', await run(store, (tx) => tx.projects.rename(pid('2'), 1, 'X')), 'not-found');
      const change = { changedBy: id('a'), changedAt: at(5) };
      const changed = { ...DEFAULTS, implementers: ['agent-secondary'], noEligibleSlot: 'reject' as const };
      const replaced = await run(store, (tx) => tx.projects.replaceDefaults(pid('1'), 1, changed, change));
      expectRead(problems, 'replaced', replaced, { defaults: changed, revision: 2, lastChange: change });
      expectSame(problems, 'stored', must(await run(store, (tx) => tx.projects.defaults(pid('1')))), { defaults: changed, revision: 2, lastChange: change });
      expectCode(problems, 'stale defaults', await run(store, (tx) => tx.projects.replaceDefaults(pid('1'), 1, DEFAULTS, change)), 'conflict');
      expectCode(problems, 'defaults unknown', await run(store, (tx) => tx.projects.replaceDefaults(pid('2'), 1, DEFAULTS, change)), 'not-found');
      const results = await Promise.all(['First', 'Second'].map((name) => run(store, (tx) => tx.projects.rename(pid('1'), 2, name))));
      expectOneWinner(problems, 'concurrent renames', results);
      expectSame(problems, 'revision', must(await run(store, (tx) => tx.projects.get(pid('1'))))?.revision, 3);
      return problems;
    },
  },
  {
    name: 'members are paged with their login names in principal identifier order',
    async check(store) {
      const problems: string[] = [];
      must(await run(store, async (tx) => {
        for (const [digit, name] of [['c', 'carol'], ['a', 'alice'], ['b', 'bob']] as const) must(await tx.principals.add(principal(digit, name)));
        must(await tx.projects.add(project('1'), DEFAULTS));
        must(await tx.projects.add(project('2'), DEFAULTS));
        must(await tx.projectRoles.assign(pid('1'), id('c'), 'project-viewer', at(1)));
        must(await tx.projectRoles.assign(pid('1'), id('a'), 'project-maintainer', at(1)));
        return tx.projectRoles.assign(pid('2'), id('b'), 'project-operator', at(1));
      }));
      const members = (after: string | undefined, limit: number) => run(store, (tx) => tx.projectRoles.members(pid('1'), after, limit));
      expectSame(problems, 'all', must(await members(undefined, 10)), [
        { principalId: id('a'), loginName: 'alice', role: 'project-maintainer' }, { principalId: id('c'), loginName: 'carol', role: 'project-viewer' },
      ]);
      expectSame(problems, 'limit', must(await members(undefined, 1)).map((member) => member.principalId), [id('a')]);
      expectSame(problems, 'after', must(await members(id('a'), 10)).map((member) => member.principalId), [id('c')]);
      expectSame(problems, 'none', must(await run(store, (tx) => tx.projectRoles.members(pid('3'), undefined, 10))), []);
      return problems;
    },
  },
  {
    name: 'stored defaults keep their values when the caller changes its input afterwards',
    async check(store) {
      const problems: string[] = [];
      const input = { ...DEFAULTS, implementers: [...DEFAULTS.implementers] };
      must(await run(store, async (tx) => {
        must(await tx.principals.add(principal('a', 'alice')));
        return tx.projects.add(project('1'), input);
      }));
      input.implementers.push('agent-tertiary');
      input.reviewer = 'agent-primary';
      expectSame(problems, 'added', must(await run(store, (tx) => tx.projects.defaults(pid('1')))), { defaults: DEFAULTS, revision: 1 });
      const change = { changedBy: id('a'), changedAt: at(5) };
      const next = { ...DEFAULTS, implementers: ['agent-secondary'] };
      must(await run(store, (tx) => tx.projects.replaceDefaults(pid('1'), 1, next, change)));
      next.implementers.push('agent-primary');
      const stored = { defaults: { ...DEFAULTS, implementers: ['agent-secondary'] }, revision: 2, lastChange: change };
      expectSame(problems, 'replaced', must(await run(store, (tx) => tx.projects.defaults(pid('1')))), stored);
      return problems;
    },
  },
  {
    name: 'of two concurrent defaults replacements at one revision exactly one wins',
    async check(store) {
      const problems: string[] = [];
      must(await run(store, async (tx) => {
        must(await tx.principals.add(principal('a', 'alice')));
        return tx.projects.add(project('1'), DEFAULTS);
      }));
      const change = { changedBy: id('a'), changedAt: at(5) };
      const candidates = [['agent-primary'], ['agent-secondary']].map((implementers) => ({ ...DEFAULTS, implementers }));
      const results = await Promise.all(candidates.map((defaults) => run(store, (tx) => tx.projects.replaceDefaults(pid('1'), 1, defaults, change))));
      const winner = expectOneWinner(problems, 'concurrent replacements', results);
      const stored = must(await run(store, (tx) => tx.projects.defaults(pid('1'))));
      if (winner !== undefined) expectSame(problems, 'stored', stored, { defaults: candidates[winner], revision: 2, lastChange: change });
      return problems;
    },
  },
  {
    name: 'concurrent assignments and a removal of one member leave one consistent role',
    async check(store) {
      const problems: string[] = [];
      must(await run(store, async (tx) => {
        must(await tx.principals.add(principal('a', 'alice')));
        must(await tx.projects.add(project('1'), DEFAULTS));
        return tx.projectRoles.assign(pid('1'), id('a'), 'project-viewer', at(1));
      }));
      const assign = (role: 'project-operator' | 'project-maintainer') => run(store, (tx) => tx.projectRoles.assign(pid('1'), id('a'), role, at(2)));
      const assigned = await Promise.all([assign('project-operator'), assign('project-maintainer')]);
      assigned.forEach((result, index) => expectSuccess(problems, `assignment ${index + 1}`, result));
      const role = must(await run(store, (tx) => tx.projectRoles.roleOf(pid('1'), id('a'))));
      if (role !== 'project-operator' && role !== 'project-maintainer') problems.push(`assigned role: got ${String(role)}`);
      const [reassigned, removed] = await Promise.all([assign('project-operator'), run(store, (tx) => tx.projectRoles.remove(pid('1'), id('a')))]);
      expectSuccess(problems, 'reassignment', reassigned);
      expectRead(problems, 'removal', removed, true);
      const members = must(await run(store, (tx) => tx.projectRoles.members(pid('1'), undefined, 10)));
      const last = must(await run(store, (tx) => tx.projectRoles.roleOf(pid('1'), id('a'))));
      if (last !== undefined && last !== 'project-operator') problems.push(`role after the race: got ${last}`);
      expectSame(problems, 'members', members.map((member) => member.role), last === undefined ? [] : [last]);
      return problems;
    },
  },
  {
    name: 'a session is replaced under a new hash, touched, and ended once',
    async check(store) {
      const problems: string[] = [];
      must(await run(store, (tx) => tx.principals.add(principal('a', 'alice'))));
      const anonymous = session('h1');
      expectSuccess(problems, 'add', await run(store, (tx) => tx.sessions.add(anonymous)));
      expectCode(problems, 'add again', await run(store, (tx) => tx.sessions.add(anonymous)), 'conflict');
      expectSame(problems, 'get', must(await run(store, (tx) => tx.sessions.get(anonymous.idHash))), anonymous);
      const rotated = session('h2', id('a'), 1);
      expectSuccess(problems, 'replace', await run(store, (tx) => tx.sessions.replace(anonymous.idHash, rotated)));
      expectSame(problems, 'old gone', must(await run(store, (tx) => tx.sessions.get(anonymous.idHash))), undefined);
      expectSame(problems, 'new', must(await run(store, (tx) => tx.sessions.get(rotated.idHash))), rotated);
      expectCode(problems, 'replace gone', await run(store, (tx) => tx.sessions.replace(anonymous.idHash, session('h3'))), 'not-found');
      expectSuccess(problems, 'touch', await run(store, (tx) => tx.sessions.touch(rotated.idHash, at(5), at(15))));
      const touched = must(await run(store, (tx) => tx.sessions.get(rotated.idHash)));
      expectSame(problems, 'touched', [touched?.lastSeenAt, touched?.idleExpiresAt], [at(5), at(15)]);
      expectSuccess(problems, 'end', await run(store, (tx) => tx.sessions.end(rotated.idHash, at(6))));
      expectSame(problems, 'ended', must(await run(store, (tx) => tx.sessions.get(rotated.idHash)))?.endedAt, at(6));
      expectCode(problems, 'end again', await run(store, (tx) => tx.sessions.end(rotated.idHash, at(7))), 'not-found');
      expectCode(problems, 'touch ended', await run(store, (tx) => tx.sessions.touch(rotated.idHash, at(7), at(17))), 'not-found');
      expectCode(problems, 'replace ended', await run(store, (tx) => tx.sessions.replace(rotated.idHash, session('h4'))), 'not-found');
      return problems;
    },
  },
  {
    name: 'a principal\'s other sessions end together, and dead or excess sessions are purged',
    async check(store) {
      const problems: string[] = [];
      must(await run(store, (tx) => tx.principals.add(principal('a', 'alice'))));
      for (const added of [session('k1', id('a')), session('k2', id('a')), session('k3', id('a')), session('n1', undefined, 1), session('n2', undefined, 2), session('n3', undefined, 3)]) {
        must(await run(store, (tx) => tx.sessions.add(added)));
      }
      expectSame(problems, 'ended', must(await run(store, (tx) => tx.sessions.endAllOf(id('a'), at(4), 'k1' as SecretHash))), 2);
      expectSame(problems, 'kept', must(await run(store, (tx) => tx.sessions.get('k1' as SecretHash)))?.endedAt, undefined);
      expectSame(problems, 'purge limit', must(await run(store, (tx) => tx.sessions.purge(at(5), 1))), 1);
      expectSame(problems, 'purge rest', must(await run(store, (tx) => tx.sessions.purge(at(5), 10))), 1);
      expectSame(problems, 'trim limit', must(await run(store, (tx) => tx.sessions.trimAnonymous(1, 1))), 1);
      expectSame(problems, 'oldest trimmed', must(await run(store, (tx) => tx.sessions.get('n1' as SecretHash))), undefined);
      expectSame(problems, 'trim rest', must(await run(store, (tx) => tx.sessions.trimAnonymous(1, 10))), 1);
      expectSame(problems, 'newest anonymous kept', must(await run(store, (tx) => tx.sessions.get('n3' as SecretHash)))?.idHash, 'n3');
      expectSame(problems, 'expired purged', must(await run(store, (tx) => tx.sessions.purge(at(30), 10))), 2);
      return problems;
    },
  },
  {
    name: 'the audit trail keeps its order, and a failed transaction writes nothing',
    async check(store) {
      const problems: string[] = [];
      const event = (kind: AccessAuditEvent['kind'], minute: number): AccessAuditEvent => Object.freeze({
        kind, principalId: id('a'), projectId: 'project-1', role: 'project-viewer', actor: 'root@host', reason: 'test', occurredAt: at(minute),
      });
      must(await run(store, (tx) => tx.principals.add(principal('a', 'alice'))));
      expectSuccess(problems, 'first', await run(store, (tx) => tx.audit.append(event('access.project-role-assigned', 1))));
      const passwordSet: AccessAuditEvent = { kind: 'access.password-set', principalId: id('a'), actor: 'root@host', reason: 'test', occurredAt: at(2) };
      expectSuccess(problems, 'second', await run(store, (tx) => tx.audit.append(passwordSet)));
      const refused: AccessAuditEvent = { kind: 'access.owner-bootstrap-refused', actor: 'root@host', reason: 'test', occurredAt: at(3) };
      expectSuccess(problems, 'without principal', await run(store, (tx) => tx.audit.append(refused)));
      const failed = await run(store, async (tx) => {
        must(await tx.principals.add(principal('b', 'bob')));
        must(await tx.audit.append(event('access.principal-created', 4)));
        return err(failure('conflict', 'rolled back'));
      });
      expectCode(problems, 'failed', failed, 'conflict');
      expectSame(problems, 'no principal', must(await run(store, (tx) => tx.principals.get(id('b')))), undefined);
      const trail = must(await run(store, (tx) => tx.audit.trail()));
      const kinds = ['access.project-role-assigned', 'access.password-set', 'access.owner-bootstrap-refused'];
      expectSame(problems, 'trail', trail.map((entry) => entry.kind), kinds);
      expectSame(problems, 'entries', trail, [event('access.project-role-assigned', 1), passwordSet, refused]);
      return problems;
    },
  },
]);

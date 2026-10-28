import { err, failure, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import { expectCode, expectOneWinner, expectSame, expectSuccess, type ConformanceCase } from '@taskelith/sdlc';
import type { AccessAuditEvent } from '../domain/access-audit.js';
import type { LoginName, PasswordHash, Principal, PrincipalId } from '../domain/principal.js';
import type { SecretHash } from '../domain/secret-hash.js';
import type { StoredSession } from '../domain/session.js';
import type { AccessStore, AccessTransaction } from './access-store.js';

// The shared suite for AccessStore; each case gets an empty store.

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`conformance fixture: ${result.error.message}`);
  return result.value;
}

const at = (minute: number): Instant => must(parseInstant(`2026-10-28T09:${String(minute).padStart(2, '0')}:00.000Z`));
const id = (digit: string) => `u${digit.repeat(32)}` as PrincipalId;

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
      must(await run(store, (tx) => tx.principals.add(principal('a', 'alice'))));
      const alice = id('a');
      expectSuccess(problems, 'assign', await run(store, (tx) => tx.projectRoles.assign('project-2', alice, 'project-viewer', at(1))));
      expectSuccess(problems, 'replace', await run(store, (tx) => tx.projectRoles.assign('project-2', alice, 'project-operator', at(2))));
      expectSuccess(problems, 'other', await run(store, (tx) => tx.projectRoles.assign('project-1', alice, 'project-maintainer', at(2))));
      expectCode(problems, 'unknown', await run(store, (tx) => tx.projectRoles.assign('project-1', id('c'), 'project-viewer', at(2))), 'not-found');
      expectSame(problems, 'role', must(await run(store, (tx) => tx.projectRoles.roleOf('project-2', alice))), 'project-operator');
      expectSame(problems, 'projects', must(await run(store, (tx) => tx.projectRoles.projectsOf(alice))), [
        { projectId: 'project-1', role: 'project-maintainer' }, { projectId: 'project-2', role: 'project-operator' },
      ]);
      expectSame(problems, 'remove', must(await run(store, (tx) => tx.projectRoles.remove('project-2', alice))), true);
      expectSame(problems, 'remove again', must(await run(store, (tx) => tx.projectRoles.remove('project-2', alice))), false);
      expectSame(problems, 'removed', must(await run(store, (tx) => tx.projectRoles.roleOf('project-2', alice))), undefined);
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
      expectSame(problems, 'trim', must(await run(store, (tx) => tx.sessions.trimAnonymous(1))), 2);
      expectSame(problems, 'newest anonymous kept', must(await run(store, (tx) => tx.sessions.get('n3' as SecretHash)))?.idHash, 'n3');
      expectSame(problems, 'oldest trimmed', must(await run(store, (tx) => tx.sessions.get('n1' as SecretHash))), undefined);
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
      const failed = await run(store, async (tx) => {
        must(await tx.principals.add(principal('b', 'bob')));
        must(await tx.audit.append(event('access.principal-created', 3)));
        return err(failure('conflict', 'rolled back'));
      });
      expectCode(problems, 'failed', failed, 'conflict');
      expectSame(problems, 'no principal', must(await run(store, (tx) => tx.principals.get(id('b')))), undefined);
      const trail = must(await run(store, (tx) => tx.audit.trail()));
      expectSame(problems, 'trail', trail.map((entry) => entry.kind), ['access.project-role-assigned', 'access.password-set']);
      expectSame(problems, 'entries', trail, [event('access.project-role-assigned', 1), passwordSet]);
      return problems;
    },
  },
]);

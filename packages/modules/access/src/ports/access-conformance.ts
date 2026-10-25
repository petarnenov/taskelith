import { parseInstant, type Instant, type Result } from '@taskelith/kernel';
import { expectCode, expectSame, expectSuccess, type ConformanceCase } from '@taskelith/sdlc';
import type { AuditEvent, OperatorCredential } from '../domain/operator-credential.js';
import type { OperatorCredentials } from './operator-credentials.js';
import type { SecretHash } from './secrets.js';

// The shared suite for OperatorCredentials; each case gets an empty store.

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`conformance fixture: ${result.error.message}`);
  return result.value;
}

const AT: Instant = must(parseInstant('2026-10-25T09:00:00.000Z'));

function credential(generation: number): OperatorCredential {
  return Object.freeze({ generation, hash: `hash-${generation}` as SecretHash, issuedAt: AT });
}

function event(generation: number): AuditEvent {
  const kind = generation === 1 ? 'operator-credential.bootstrapped' : 'operator-credential.reset';
  return Object.freeze({ kind, generation, actor: 'admin@host', reason: generation === 1 ? 'bootstrap' : 'lost', occurredAt: AT });
}

export const OPERATOR_CREDENTIALS_CONFORMANCE: readonly ConformanceCase<OperatorCredentials>[] = Object.freeze([
  {
    name: 'an empty store has no credential and no audit trail',
    async check(store) {
      const problems: string[] = [];
      expectSame(problems, 'current', must(await store.current()), undefined);
      expectSame(problems, 'trail', must(await store.auditTrail()), []);
      return problems;
    },
  },
  {
    name: 'install accepts only the next generation, with its audit event',
    async check(store) {
      const problems: string[] = [];
      expectCode(problems, 'generation 2 first', await store.install(credential(2), event(2)), 'conflict');
      expectSuccess(problems, 'bootstrap', await store.install(credential(1), event(1)));
      expectCode(problems, 'bootstrap again', await store.install(credential(1), event(1)), 'conflict');
      expectSuccess(problems, 'reset', await store.install(credential(2), event(2)));
      expectSame(problems, 'current', must(await store.current()), credential(2));
      expectSame(problems, 'trail', must(await store.auditTrail()), [event(1), event(2)]);
      return problems;
    },
  },
  {
    name: 'of concurrent installs of one generation exactly one wins',
    async check(store) {
      const problems: string[] = [];
      const results = await Promise.all([store.install(credential(1), event(1)), store.install(credential(1), event(1))]);
      expectSame(problems, 'winners', results.filter((result) => result.ok).length, 1);
      expectSame(problems, 'trail length', must(await store.auditTrail()).length, 1);
      return problems;
    },
  },
]);

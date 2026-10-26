import { parseIdentifier, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import { expectCode, expectOneWinner, expectRead, expectSame, expectSuccess, type ConformanceCase } from '@taskelith/sdlc';
import { DEFAULT_PROVIDER_CREDENTIAL_CONCURRENCY } from '../domain/capacity-limits.js';
import {
  FIRST_SLOT_REVISION,
  type AccountSlot,
  type HarnessPluginId,
  type SubscriptionMechanismId,
} from '../domain/account-slot.js';
import type { ProjectId, ProviderCredentialId } from '../domain/capacity-reservation.js';
import { SlotSecret } from '../domain/slot-secret.js';
import type { AccountSlots, SlotCredentials } from './account-pool.js';

// Shared suites for the account pool ports (contract section 9).

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`conformance fixture: ${result.error.message}`);
  return result.value;
}

const id = <Kind extends string>(kind: Kind, text: string) => must(parseIdentifier(kind, text));
const AT: Instant = must(parseInstant('2026-10-26T09:00:00.000Z'));
const LATER: Instant = must(parseInstant('2026-10-26T10:00:00.000Z'));
const PROJECT = id('ProjectId', 'project-1') as ProjectId;
const OTHER_PROJECT = id('ProjectId', 'project-2') as ProjectId;
const HARNESS = id('HarnessPluginId', 'harness-1') as HarnessPluginId;
const OTHER_HARNESS = id('HarnessPluginId', 'harness-2') as HarnessPluginId;
const MECHANISM = id('SubscriptionMechanismId', 'mechanism-1') as SubscriptionMechanismId;
const UNKNOWN_SLOT = id('ProviderCredentialId', 'slot-unknown') as ProviderCredentialId;

function slot(text: string, overrides: Partial<AccountSlot> = {}): AccountSlot {
  return Object.freeze({
    id: id('ProviderCredentialId', text) as ProviderCredentialId,
    harness: HARNESS,
    mechanism: MECHANISM,
    allowedProjects: Object.freeze([PROJECT]),
    concurrencyLimit: DEFAULT_PROVIDER_CREDENTIAL_CONCURRENCY,
    state: 'active' as const,
    health: 'healthy' as const,
    revision: FIRST_SLOT_REVISION,
    ...overrides,
  });
}

const next = (stored: AccountSlot, changes: Partial<AccountSlot>): AccountSlot =>
  Object.freeze({ ...stored, ...changes, revision: stored.revision + 1 });

// Every state and pool membership; the pool keeps ineligible active slots.
const POOL_FIXTURES: readonly AccountSlot[] = Object.freeze([
  slot('slot-c-shared', { allowedProjects: Object.freeze([OTHER_PROJECT, PROJECT]) }),
  slot('slot-a-plain'),
  slot('slot-b-cooling', { health: 'unhealthy', cooldown: { until: LATER, source: 'default' }, usage: { fraction: 0.5, windowEndsAt: LATER } }),
  slot('slot-d-other-project', { allowedProjects: Object.freeze([OTHER_PROJECT]) }),
  slot('slot-e-other-harness', { harness: OTHER_HARNESS }),
  slot('slot-f-revoked', { state: 'revoked' }),
  slot('slot-g-removed', { state: 'removed' }),
]);

const ids = (slots: readonly AccountSlot[]) => slots.map((stored) => stored.id);

export const ACCOUNT_SLOTS_CONFORMANCE: readonly ConformanceCase<AccountSlots>[] = Object.freeze([
  {
    name: 'adds a slot once at the first revision and reads it in every state',
    async check(slots: AccountSlots) {
      const problems: string[] = [];
      for (const stored of POOL_FIXTURES) expectSuccess(problems, `add ${stored.id}`, await slots.add(stored));
      expectCode(problems, 'add again', await slots.add(slot('slot-a-plain', { concurrencyLimit: 1 })), 'conflict');
      expectCode(problems, 'later revision', await slots.add(slot('slot-h-new', { revision: 2 })), 'invalid');
      for (const stored of POOL_FIXTURES) expectRead(problems, `get ${stored.id}`, await slots.get(stored.id), stored);
      expectCode(problems, 'unknown', await slots.get(UNKNOWN_SLOT), 'not-found');
      return problems;
    },
  },
  {
    name: 'a pool holds the active slots of its harness allowed for its project, by identifier',
    async check(slots: AccountSlots) {
      const problems: string[] = [];
      for (const stored of POOL_FIXTURES) expectSuccess(problems, `add ${stored.id}`, await slots.add(stored));
      const pool = await slots.pool(PROJECT, HARNESS);
      expectSame(problems, 'pool', ids(pool), ['slot-a-plain', 'slot-b-cooling', 'slot-c-shared']);
      expectSame(problems, 'records', pool, [POOL_FIXTURES[1], POOL_FIXTURES[2], POOL_FIXTURES[0]]);
      expectSame(problems, 'other project', ids(await slots.pool(OTHER_PROJECT, HARNESS)), ['slot-c-shared', 'slot-d-other-project']);
      expectSame(problems, 'other harness', ids(await slots.pool(PROJECT, OTHER_HARNESS)), ['slot-e-other-harness']);
      const none = id('ProjectId', 'project-none') as ProjectId;
      expectSame(problems, 'no pool', await slots.pool(none, HARNESS), []);
      return problems;
    },
  },
  {
    name: 'replace is a compare-and-set that moves the revision by one',
    async check(slots: AccountSlots) {
      const problems: string[] = [];
      const stored = slot('slot-a-plain');
      expectSuccess(problems, 'add', await slots.add(stored));
      const cooled = next(stored, { cooldown: { until: LATER, source: 'reported-reset' }, lastReservedAt: AT });
      expectSuccess(problems, 'replace', await slots.replace(cooled, stored.revision));
      expectRead(problems, 'replaced', await slots.get(stored.id), cooled);
      expectCode(problems, 'stale', await slots.replace(next(stored, { health: 'unhealthy' }), stored.revision), 'conflict');
      expectCode(problems, 'skipped revision', await slots.replace({ ...cooled, revision: cooled.revision + 2 }, cooled.revision), 'invalid');
      expectCode(problems, 'future expectation', await slots.replace({ ...cooled, revision: 6 }, 5), 'conflict');
      expectCode(problems, 'unknown', await slots.replace(next(slot('slot-unknown'), {}), FIRST_SLOT_REVISION), 'not-found');
      expectRead(problems, 'unchanged', await slots.get(stored.id), cooled);
      return problems;
    },
  },
  {
    name: 'of concurrent replaces at one revision exactly one wins',
    async check(slots: AccountSlots) {
      const problems: string[] = [];
      const stored = slot('slot-a-plain');
      expectSuccess(problems, 'add', await slots.add(stored));
      const writes = [next(stored, { lastReservedAt: AT }), next(stored, { lastReservedAt: LATER })];
      const results = await Promise.all(writes.map((write) => slots.replace(write, stored.revision)));
      const winner = expectOneWinner(problems, 'race', results);
      if (winner !== undefined) expectRead(problems, 'winner stored', await slots.get(stored.id), writes[winner]);
      return problems;
    },
  },
  {
    name: 'a slot keeps its harness, and a removed slot stays removed',
    async check(slots: AccountSlots) {
      const problems: string[] = [];
      const stored = slot('slot-a-plain');
      expectSuccess(problems, 'add', await slots.add(stored));
      expectCode(problems, 'harness', await slots.replace(next(stored, { harness: OTHER_HARNESS }), stored.revision), 'invalid');
      const revoked = next(stored, { state: 'revoked' });
      expectSuccess(problems, 'revoke', await slots.replace(revoked, stored.revision));
      const removed = next(revoked, { state: 'removed' });
      expectSuccess(problems, 'remove', await slots.replace(removed, revoked.revision));
      expectCode(problems, 'leave removed', await slots.replace(next(removed, { state: 'active' }), removed.revision), 'invalid');
      expectRead(problems, 'tombstone', await slots.get(stored.id), removed);
      expectSame(problems, 'not in a pool', await slots.pool(PROJECT, HARNESS), []);
      return problems;
    },
  },
]);

const secret = (text: string) => must(SlotSecret.of(text));
const CREDENTIAL_SLOT = id('ProviderCredentialId', 'slot-a-plain') as ProviderCredentialId;

function expectRevealed(problems: string[], label: string, result: Result<SlotSecret>, text: string): void {
  if (!result.ok) problems.push(`${label}: expected the credential, got ${result.error.message}`);
  else expectSame(problems, label, result.value.reveal(), text);
}

// The form util.inspect and console.log print, without importing them.
function inspected(value: SlotSecret): string {
  const custom: unknown = (value as unknown as Record<symbol, unknown>)[Symbol.for('nodejs.util.inspect.custom')];
  return typeof custom === 'function' ? String(custom.call(value)) : 'no inspection form: secret-material';
}

export const SLOT_CREDENTIALS_CONFORMANCE: readonly ConformanceCase<SlotCredentials>[] = Object.freeze([
  {
    name: 'stores, replaces, and destroys a slot credential, idempotently',
    async check(credentials: SlotCredentials) {
      const problems: string[] = [];
      expectCode(problems, 'none yet', await credentials.reveal(CREDENTIAL_SLOT), 'not-found');
      expectSuccess(problems, 'store', await credentials.store(CREDENTIAL_SLOT, secret('first-material')));
      expectRevealed(problems, 'stored', await credentials.reveal(CREDENTIAL_SLOT), 'first-material');
      expectSuccess(problems, 'rotate', await credentials.store(CREDENTIAL_SLOT, secret('second-material')));
      expectRevealed(problems, 'rotated', await credentials.reveal(CREDENTIAL_SLOT), 'second-material');
      expectCode(problems, 'other slot', await credentials.reveal(UNKNOWN_SLOT), 'not-found');
      expectSuccess(problems, 'destroy', await credentials.destroy(CREDENTIAL_SLOT));
      expectCode(problems, 'destroyed', await credentials.reveal(CREDENTIAL_SLOT), 'not-found');
      expectSuccess(problems, 'destroy again', await credentials.destroy(CREDENTIAL_SLOT));
      return problems;
    },
  },
  {
    name: 'a revealed credential prints and serializes as redacted',
    async check(credentials: SlotCredentials) {
      const problems: string[] = [];
      expectSuccess(problems, 'store', await credentials.store(CREDENTIAL_SLOT, secret('secret-material')));
      const revealed = await credentials.reveal(CREDENTIAL_SLOT);
      if (!revealed.ok) return [...problems, `reveal: ${revealed.error.message}`];
      const forms = [String(revealed.value), `${revealed.value}`, JSON.stringify({ revealed: revealed.value }), inspected(revealed.value)];
      for (const form of forms) if (form.includes('secret-material')) problems.push(`form discloses the credential: ${form}`);
      return problems;
    },
  },
]);

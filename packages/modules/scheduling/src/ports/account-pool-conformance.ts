import type { HarnessPluginId } from '@taskelith/execution';
import { parseIdentifier, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import { expectCode, expectOneWinner, expectRead, expectSame, expectSuccess, type ConformanceCase } from '@taskelith/sdlc';
import { DEFAULT_PROVIDER_CREDENTIAL_CONCURRENCY } from '../domain/capacity-limits.js';
import {
  FIRST_SLOT_REVISION,
  type AccountSlot,
  type SlotCredentialVersion,
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
const version = (text: string) => id('SlotCredentialVersion', text) as SlotCredentialVersion;
const FIRST_VERSION = version('version-1');
const SECOND_VERSION = version('version-2');

function slot(text: string, overrides: Partial<AccountSlot> = {}): AccountSlot {
  return Object.freeze({
    id: id('ProviderCredentialId', text) as ProviderCredentialId,
    harnessId: HARNESS,
    mechanismId: MECHANISM,
    credentialVersion: FIRST_VERSION,
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
  slot('slot-e-other-harness', { harnessId: OTHER_HARNESS }),
  slot('slot-f-revoked', { state: 'revoked' }),
  slot('slot-g-removed', { state: 'removed' }),
  // Before `slot-a-plain` in code point order, after it in a locale order.
  slot('slot-Z-upper'),
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
    name: 'a pool holds the active slots of its harness allowed for its project, in code point order',
    async check(slots: AccountSlots) {
      const problems: string[] = [];
      for (const stored of POOL_FIXTURES) expectSuccess(problems, `add ${stored.id}`, await slots.add(stored));
      const pool = await slots.pool(PROJECT, HARNESS);
      expectSame(problems, 'pool', ids(pool), ['slot-Z-upper', 'slot-a-plain', 'slot-b-cooling', 'slot-c-shared']);
      expectSame(problems, 'records', pool, [POOL_FIXTURES[7], POOL_FIXTURES[1], POOL_FIXTURES[2], POOL_FIXTURES[0]]);
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
      expectCode(problems, 'skip at a stale revision', await slots.replace({ ...cooled, revision: 9 }, 5), 'invalid');
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
      const moved = next(stored, { harnessId: OTHER_HARNESS });
      expectCode(problems, 'harness', await slots.replace(moved, stored.revision), 'invalid');
      const revoked = next(stored, { state: 'revoked' });
      expectSuccess(problems, 'revoke', await slots.replace(revoked, stored.revision));
      // Invalid is checked before conflict (contract section 6.1).
      expectCode(problems, 'harness at a stale revision', await slots.replace(moved, stored.revision), 'invalid');
      const removed = next(revoked, { state: 'removed' });
      expectSuccess(problems, 'remove', await slots.replace(removed, revoked.revision));
      expectCode(problems, 'leave removed', await slots.replace(next(removed, { state: 'active' }), removed.revision), 'invalid');
      expectCode(problems, 'removed to revoked', await slots.replace(next(removed, { state: 'revoked' }), removed.revision), 'invalid');
      expectRead(problems, 'tombstone', await slots.get(stored.id), removed);
      expectSame(problems, 'not in a pool', ids(await slots.pool(PROJECT, HARNESS)), []);
      return problems;
    },
  },
]);

const secret = (text: string) => must(SlotSecret.of(text));
const CREDENTIAL_SLOT = id('ProviderCredentialId', 'slot-a-plain') as ProviderCredentialId;
const OTHER_CREDENTIAL_SLOT = id('ProviderCredentialId', 'slot-b-other') as ProviderCredentialId;

function expectRevealed(problems: string[], label: string, result: Result<SlotSecret>, text: string): void {
  if (!result.ok) problems.push(`${label}: expected the credential, got ${result.error.message}`);
  else expectSame(problems, label, result.value.reveal(), text);
}

const SECRET_TEXT = 'secret-material';

// The custom form that util.inspect and console.log print, if any.
function customInspection(value: SlotSecret): string | undefined {
  const custom: unknown = (value as unknown as Record<symbol, unknown>)[Symbol.for('nodejs.util.inspect.custom')];
  return typeof custom === 'function' ? String(custom.call(value)) : undefined;
}

export const SLOT_CREDENTIALS_CONFORMANCE: readonly ConformanceCase<SlotCredentials>[] = Object.freeze([
  {
    name: 'stores each version once and discards one, idempotently',
    async check(credentials: SlotCredentials) {
      const problems: string[] = [];
      expectCode(problems, 'none yet', await credentials.reveal(CREDENTIAL_SLOT, FIRST_VERSION), 'not-found');
      await credentials.store(CREDENTIAL_SLOT, FIRST_VERSION, secret('first-material'));
      await credentials.store(CREDENTIAL_SLOT, SECOND_VERSION, secret('second-material'));
      await credentials.store(CREDENTIAL_SLOT, FIRST_VERSION, secret('replacing-material'));
      expectRevealed(problems, 'first kept', await credentials.reveal(CREDENTIAL_SLOT, FIRST_VERSION), 'first-material');
      expectRevealed(problems, 'second', await credentials.reveal(CREDENTIAL_SLOT, SECOND_VERSION), 'second-material');
      expectCode(problems, 'other slot', await credentials.reveal(UNKNOWN_SLOT, FIRST_VERSION), 'not-found');
      await credentials.discard(CREDENTIAL_SLOT, FIRST_VERSION);
      expectCode(problems, 'discarded', await credentials.reveal(CREDENTIAL_SLOT, FIRST_VERSION), 'not-found');
      await credentials.discard(CREDENTIAL_SLOT, FIRST_VERSION);
      expectRevealed(problems, 'other kept', await credentials.reveal(CREDENTIAL_SLOT, SECOND_VERSION), 'second-material');
      return problems;
    },
  },
  {
    name: 'discards every version but the current one, idempotently, and keeps later stores',
    async check(credentials: SlotCredentials) {
      const problems: string[] = [];
      const orphan = version('version-orphan');
      await credentials.store(CREDENTIAL_SLOT, FIRST_VERSION, secret('replaced-material'));
      await credentials.store(CREDENTIAL_SLOT, orphan, secret('orphaned-material'));
      await credentials.store(CREDENTIAL_SLOT, SECOND_VERSION, secret('current-material'));
      await credentials.store(OTHER_CREDENTIAL_SLOT, FIRST_VERSION, secret('other-material'));
      await credentials.discardAllExcept(CREDENTIAL_SLOT, SECOND_VERSION);
      expectCode(problems, 'replaced', await credentials.reveal(CREDENTIAL_SLOT, FIRST_VERSION), 'not-found');
      expectCode(problems, 'orphaned', await credentials.reveal(CREDENTIAL_SLOT, orphan), 'not-found');
      expectRevealed(problems, 'current', await credentials.reveal(CREDENTIAL_SLOT, SECOND_VERSION), 'current-material');
      expectRevealed(problems, 'other slot', await credentials.reveal(OTHER_CREDENTIAL_SLOT, FIRST_VERSION), 'other-material');
      await credentials.discardAllExcept(CREDENTIAL_SLOT, SECOND_VERSION);
      await credentials.discardAllExcept(UNKNOWN_SLOT, FIRST_VERSION);
      expectRevealed(problems, 'current again', await credentials.reveal(CREDENTIAL_SLOT, SECOND_VERSION), 'current-material');
      await credentials.store(CREDENTIAL_SLOT, version('version-later'), secret('later-material'));
      expectRevealed(problems, 'later store', await credentials.reveal(CREDENTIAL_SLOT, version('version-later')), 'later-material');
      return problems;
    },
  },
  {
    name: 'destroys every version, idempotently, and keeps no later store',
    async check(credentials: SlotCredentials) {
      const problems: string[] = [];
      await credentials.store(CREDENTIAL_SLOT, FIRST_VERSION, secret('first-material'));
      await credentials.store(CREDENTIAL_SLOT, SECOND_VERSION, secret('second-material'));
      await credentials.destroy(CREDENTIAL_SLOT);
      expectCode(problems, 'first destroyed', await credentials.reveal(CREDENTIAL_SLOT, FIRST_VERSION), 'not-found');
      expectCode(problems, 'second destroyed', await credentials.reveal(CREDENTIAL_SLOT, SECOND_VERSION), 'not-found');
      await credentials.destroy(CREDENTIAL_SLOT);
      await credentials.store(CREDENTIAL_SLOT, version('version-late'), secret('late-material'));
      expectCode(problems, 'late store', await credentials.reveal(CREDENTIAL_SLOT, version('version-late')), 'not-found');
      return problems;
    },
  },
  {
    name: 'a revealed credential prints and serializes as redacted',
    async check(credentials: SlotCredentials) {
      const problems: string[] = [];
      await credentials.store(CREDENTIAL_SLOT, FIRST_VERSION, secret(SECRET_TEXT));
      const revealed = await credentials.reveal(CREDENTIAL_SLOT, FIRST_VERSION);
      if (!revealed.ok) return [...problems, `reveal: ${revealed.error.message}`];
      const forms = [String(revealed.value), `${revealed.value}`, JSON.stringify({ revealed: revealed.value })];
      for (const form of forms) if (form.includes(SECRET_TEXT)) problems.push(`form discloses the credential: ${form}`);
      const inspection = customInspection(revealed.value);
      if (inspection === undefined) problems.push('no custom inspection form, so util.inspect may disclose it');
      else if (inspection.includes(SECRET_TEXT)) problems.push(`inspection discloses the credential: ${inspection}`);
      return problems;
    },
  },
]);

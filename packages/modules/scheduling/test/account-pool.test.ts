import assert from 'node:assert/strict';
import test from 'node:test';
import { inspect } from 'node:util';
import type { HarnessPluginId } from '@taskelith/execution';
import { err, failure, ok, parseIdentifier, parseInstant, REDACTED, type Instant, type Result } from '@taskelith/kernel';
import type { ConformanceCase } from '@taskelith/sdlc';
import {
  ACCOUNT_SLOTS_CONFORMANCE,
  COOLDOWN_SOURCES,
  DEFAULT_PROVIDER_CREDENTIAL_CONCURRENCY,
  FIRST_SLOT_REVISION,
  InMemoryAccountSlots,
  InMemorySlotCredentials,
  NO_SLOT_POLICIES,
  SLOT_COOLDOWN_DEFAULT_MINUTES,
  SLOT_CREDENTIALS_CONFORMANCE,
  SLOT_HEALTH,
  SLOT_INELIGIBILITY_REASONS,
  SLOT_REJECTING_REASONS,
  SLOT_REQUEST_KINDS,
  SLOT_STATES,
  SLOT_WAITING_REASON,
  SlotSecret,
  parseAccountSlot,
  parseSlotCredentialVersion,
  parseSlotRequest,
  type AccountSlot,
  type AccountSlots,
  type SubscriptionMechanismId,
  type ProjectId,
  type ProviderCredentialId,
  type SlotCredentialVersion,
  type SlotCredentials,
  type SlotRequest,
  type StoredSlotCredential,
} from '@taskelith/scheduling';
import * as scheduling from '@taskelith/scheduling';

// The values the account pool contract fixes; a change here is a contract
// change and needs the contract and the wire schemas updated with it.
const CONTRACT_VALUES = [
  ['SLOT_STATES', SLOT_STATES, ['active', 'revoked', 'removed']],
  ['SLOT_HEALTH', SLOT_HEALTH, ['healthy', 'unhealthy']],
  ['COOLDOWN_SOURCES', COOLDOWN_SOURCES, ['reported-reset', 'default']],
  [
    'SLOT_INELIGIBILITY_REASONS',
    SLOT_INELIGIBILITY_REASONS,
    ['removed', 'revoked', 'not-allowed', 'unhealthy', 'cooling-down', 'at-concurrency-limit'],
  ],
  ['SLOT_REQUEST_KINDS', SLOT_REQUEST_KINDS, ['new-session', 'resumed-session', 'after-limit']],
  ['NO_SLOT_POLICIES', NO_SLOT_POLICIES, ['wait', 'reject']],
  ['SLOT_REJECTING_REASONS', SLOT_REJECTING_REASONS, ['no-eligible-slot', 'session-slot-withdrawn']],
] as const;

for (const [name, actual, expected] of CONTRACT_VALUES) {
  test(`${name} holds the contract's values, frozen`, () => {
    assert.deepEqual(actual, expected);
    assert.ok(Object.isFrozen(actual));
  });
}

test('the scalar contract values hold', () => {
  assert.equal(FIRST_SLOT_REVISION, 1);
  assert.equal(SLOT_WAITING_REASON, 'provider-concurrency-exhausted');
  assert.deepEqual(SLOT_COOLDOWN_DEFAULT_MINUTES, { minimum: 1, maximum: 1440, provisional: 60 });
  assert.ok(Object.isFrozen(SLOT_COOLDOWN_DEFAULT_MINUTES));
});

test('a slot secret reveals its text only through reveal()', () => {
  const made = SlotSecret.of('secret-material');
  assert.ok(made.ok);
  assert.equal(made.value.reveal(), 'secret-material');
  assert.equal(String(made.value), REDACTED);
  assert.equal(JSON.stringify({ secret: made.value }), `{"secret":"${REDACTED}"}`);
  assert.equal(inspect({ secret: made.value }), `{ secret: ${REDACTED} }`);
});

test('the redaction text is the kernel\'s, not a second export', () => {
  assert.ok(!('REDACTED' in scheduling));
});

function identifier<Kind extends string>(kind: Kind, text: string) {
  const parsed = parseIdentifier(kind, text);
  assert.ok(parsed.ok);
  return parsed.value;
}

function credentialVersion(value: number): SlotCredentialVersion {
  const parsed = parseSlotCredentialVersion(value);
  assert.ok(parsed.ok);
  return parsed.value;
}

const PROJECT = identifier('ProjectId', 'project-1') as ProjectId;
const parsedWindowEnd = parseInstant('2026-10-26T10:00:00.000Z');
assert.ok(parsedWindowEnd.ok);
const WINDOW_END = parsedWindowEnd.value;
const VALID_SLOT: AccountSlot = {
  id: identifier('ProviderCredentialId', 'slot-1') as ProviderCredentialId,
  harnessId: identifier('HarnessPluginId', 'harness-1') as HarnessPluginId,
  mechanismId: identifier('SubscriptionMechanismId', 'mechanism-1') as SubscriptionMechanismId,
  credentialVersion: credentialVersion(1),
  allowedProjects: [PROJECT],
  concurrencyLimit: DEFAULT_PROVIDER_CREDENTIAL_CONCURRENCY,
  state: 'active',
  health: 'healthy',
  revision: FIRST_SLOT_REVISION,
};

const REPORTING_SLOT: AccountSlot = {
  ...VALID_SLOT,
  cooldown: { until: WINDOW_END, source: 'default' },
  usage: { fraction: 0.5, windowEndsAt: WINDOW_END },
};

test('a valid slot parses into a frozen record', () => {
  for (const slot of [VALID_SLOT, REPORTING_SLOT]) {
    const parsed = parseAccountSlot(slot);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.value, slot);
    const { allowedProjects, cooldown, usage } = parsed.value;
    assert.ok([parsed.value, allowedProjects, cooldown, usage].every((part) => Object.isFrozen(part)));
  }
});

const INVALID_SLOTS: readonly [string, Partial<AccountSlot>][] = [
  ['no project', { allowedProjects: [] }],
  ['a project twice', { allowedProjects: [PROJECT, PROJECT] }],
  ['zero concurrency', { concurrencyLimit: 0 }],
  ['fractional concurrency', { concurrencyLimit: 1.5 }],
  ['zero revision', { revision: 0 }],
  ['a fractional credential version', { credentialVersion: 1.5 as SlotCredentialVersion }],
  ['usage above 1', { usage: { fraction: 1.2, windowEndsAt: WINDOW_END } }],
  ['usage not a number', { usage: { fraction: Number.NaN, windowEndsAt: WINDOW_END } }],
];

for (const [name, overrides] of INVALID_SLOTS) {
  test(`a slot with ${name} is invalid`, () => {
    const parsed = parseAccountSlot({ ...VALID_SLOT, ...overrides });
    assert.equal(!parsed.ok && parsed.error.code, 'invalid');
  });
}

const HARNESS = VALID_SLOT.harnessId;
const OTHER_HARNESS = identifier('HarnessPluginId', 'harness-2') as HarnessPluginId;
const THIRD_HARNESS = identifier('HarnessPluginId', 'harness-3') as HarnessPluginId;
const LIMITED = Object.freeze({ harnessId: HARNESS, slotId: VALID_SLOT.id });

const afterLimit = (alternatives: readonly HarnessPluginId[]): SlotRequest => ({
  projectId: PROJECT,
  kind: 'after-limit',
  limited: LIMITED,
  alternatives,
});

const VALID_REQUESTS: readonly [string, SlotRequest][] = [
  ['a new session', { projectId: PROJECT, kind: 'new-session', harnessId: HARNESS, whenNoSlot: 'wait' }],
  ['a resumed session', { projectId: PROJECT, kind: 'resumed-session', pinned: LIMITED }],
  ['an after-limit request', afterLimit([OTHER_HARNESS, THIRD_HARNESS])],
  ['an after-limit request without alternatives', afterLimit([])],
];

for (const [name, request] of VALID_REQUESTS) {
  test(`${name} parses unchanged`, () => {
    const parsed = parseSlotRequest(request);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.value, request);
  });
}

const INVALID_REQUESTS: readonly [string, readonly HarnessPluginId[]][] = [
  ['the limited harness', [OTHER_HARNESS, HARNESS]],
  ['a harness twice', [OTHER_HARNESS, THIRD_HARNESS, OTHER_HARNESS]],
];

for (const [name, alternatives] of INVALID_REQUESTS) {
  test(`an after-limit request with ${name} among its alternatives is invalid`, () => {
    const parsed = parseSlotRequest(afterLimit(alternatives));
    assert.equal(!parsed.ok && parsed.error.code, 'invalid');
  });
}

test('an empty slot secret is invalid', () => {
  const made = SlotSecret.of('');
  assert.equal(made.ok, false);
  assert.equal(!made.ok && made.error.code, 'invalid');
});

for (const conformance of ACCOUNT_SLOTS_CONFORMANCE) {
  test(`in-memory account slots: ${conformance.name}`, async () => {
    assert.deepEqual(await conformance.check(new InMemoryAccountSlots()), []);
  });
}

for (const conformance of SLOT_CREDENTIALS_CONFORMANCE) {
  test(`in-memory slot credentials: ${conformance.name}`, async () => {
    assert.deepEqual(await conformance.check(new InMemorySlotCredentials()), []);
  });
}

// Each suite must fail an adapter that breaks its rules, or it proves nothing.
// This one overwrites without a revision, harness, or tombstone check.
class LenientAccountSlots extends InMemoryAccountSlots {
  override async replace(slot: AccountSlot): Promise<Result<void>> {
    return this.write(slot);
  }
}

class LeakingSlotCredentials extends InMemorySlotCredentials {
  override async reveal(slotId: ProviderCredentialId, version: SlotCredentialVersion): Promise<Result<SlotSecret>> {
    const revealed = await super.reveal(slotId, version);
    if (!revealed.ok) return revealed;
    const text = revealed.value.reveal();
    return ok(Object.assign(Object.create(SlotSecret.prototype) as SlotSecret, { reveal: () => text, toJSON: () => text }));
  }
}

// One credential per slot: a store replaces every earlier version.
class UnversionedSlotCredentials extends InMemorySlotCredentials {
  override async store(slotId: ProviderCredentialId, secret: SlotSecret): Promise<SlotCredentialVersion> {
    this.versions.delete(slotId);
    return super.store(slotId, secret);
  }
}

// One more than the highest surviving version, so a deleted one comes back.
class ReusingSlotCredentials extends InMemorySlotCredentials {
  protected override nextVersion(slotId: ProviderCredentialId): SlotCredentialVersion {
    return credentialVersion(Math.max(0, ...(this.versions.get(slotId)?.keys() ?? [])) + 1);
  }
}

// A store after destroy brings the slot's credential back.
class ResurrectingSlotCredentials extends InMemorySlotCredentials {
  override async destroy(slotId: ProviderCredentialId): Promise<void> {
    await super.destroy(slotId);
    this.destroyed.delete(slotId);
  }
}

// A lower version stays until the slot is removed.
class RetainingSlotCredentials extends InMemorySlotCredentials {
  override async discardOlderThan(): Promise<void> {}
}

// Every version but the named one, a higher one that is current included.
class OverDiscardingSlotCredentials extends InMemorySlotCredentials {
  override async discardOlderThan(slotId: ProviderCredentialId, version: SlotCredentialVersion): Promise<void> {
    const stored = this.versionsOf(slotId);
    for (const other of stored.keys()) if (other !== version) stored.delete(other);
  }
}

async function failingCases<Port>(cases: readonly ConformanceCase<Port>[], port: () => Port): Promise<string[]> {
  const failing: string[] = [];
  for (const conformance of cases) if ((await conformance.check(port())).length > 0) failing.push(conformance.name);
  return failing;
}

test('the account slots suite rejects an adapter without compare-and-set', async () => {
  assert.deepEqual(await failingCases(ACCOUNT_SLOTS_CONFORMANCE, () => new LenientAccountSlots()), [
    'replace is a compare-and-set that moves the revision by one',
    'of concurrent replaces at one revision exactly one wins',
    'a slot keeps its harness, and a removed slot stays removed',
  ]);
});

test('the slot credentials suite rejects an adapter that discloses a credential', async () => {
  assert.deepEqual(await failingCases(SLOT_CREDENTIALS_CONFORMANCE, () => new LeakingSlotCredentials()), [
    'a revealed credential prints and serializes as redacted',
  ]);
});

test('the slot credentials suite rejects an adapter that replaces a version', async () => {
  assert.deepEqual(await failingCases(SLOT_CREDENTIALS_CONFORMANCE, () => new UnversionedSlotCredentials()), [
    'stores each credential under a new version and discards one, idempotently',
    'discards only the lower versions of a slot, idempotently, and keeps the rest',
    'lists the versions stored before an instant by slot in code-unit order, then by version',
  ]);
});

test('the slot credentials suite rejects an adapter that reuses a deleted version', async () => {
  assert.deepEqual(await failingCases(SLOT_CREDENTIALS_CONFORMANCE, () => new ReusingSlotCredentials()), [
    'versions strictly increase per slot and are never reused after a discard or destroy',
  ]);
});

test('the slot credentials suite rejects an adapter that keeps a store after destroy', async () => {
  assert.deepEqual(await failingCases(SLOT_CREDENTIALS_CONFORMANCE, () => new ResurrectingSlotCredentials()), [
    'destroys every version, idempotently, and keeps no later store',
  ]);
});

test('the slot credentials suite rejects an adapter that retains lower versions', async () => {
  assert.deepEqual(await failingCases(SLOT_CREDENTIALS_CONFORMANCE, () => new RetainingSlotCredentials()), [
    'discards only the lower versions of a slot, idempotently, and keeps the rest',
  ]);
});

test('the slot credentials suite rejects an adapter that discards higher versions', async () => {
  assert.deepEqual(await failingCases(SLOT_CREDENTIALS_CONFORMANCE, () => new OverDiscardingSlotCredentials()), [
    'discards only the lower versions of a slot, idempotently, and keeps the rest',
  ]);
});

// Lists every stored version, however recently it was stored.
class AgelessListingSlotCredentials extends InMemorySlotCredentials {
  override async listStored(): Promise<readonly StoredSlotCredential[]> {
    const farFuture = parseInstant('2100-01-01T00:00:00.000Z');
    assert.ok(farFuture.ok);
    return super.listStored(farFuture.value);
  }
}

// Orders slot ids by locale, which puts an upper-case id after lower-case.
class LocaleListingSlotCredentials extends InMemorySlotCredentials {
  override async listStored(storedBefore: Instant): Promise<readonly StoredSlotCredential[]> {
    return [...await super.listStored(storedBefore)].sort((left, right) => left.slotId.localeCompare(right.slotId) || left.version - right.version);
  }
}

for (const [name, adapter] of [
  ['ignores the instant', () => new AgelessListingSlotCredentials()],
  ['orders slots by locale', () => new LocaleListingSlotCredentials()],
] as const) {
  test(`the slot credentials suite rejects a listing that ${name}`, async () => {
    assert.deepEqual(await failingCases(SLOT_CREDENTIALS_CONFORMANCE, adapter), [
      'lists the versions stored before an instant by slot in code-unit order, then by version',
    ]);
  });
}

// Counts tombstones too, so a removed slot would block a new one.
class TombstoneCountingAccountSlots extends InMemoryAccountSlots {
  readonly #all: AccountSlot[] = [];

  override async add(slot: AccountSlot): Promise<Result<void>> {
    const added = await super.add(slot);
    if (added.ok) this.#all.push(slot);
    return added;
  }

  override async countNotRemoved(harnessId: HarnessPluginId): Promise<number> {
    return this.#all.filter((slot) => slot.harnessId === harnessId).length;
  }
}

test('the account slots suite rejects an adapter that counts removed slots', async () => {
  assert.deepEqual(await failingCases(ACCOUNT_SLOTS_CONFORMANCE, () => new TombstoneCountingAccountSlots()), [
    'counts the slots of a harness that are not removed, in every project',
  ]);
});

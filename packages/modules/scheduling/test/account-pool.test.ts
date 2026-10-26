import assert from 'node:assert/strict';
import test from 'node:test';
import { inspect } from 'node:util';
import { err, failure, ok, parseIdentifier, parseInstant, type Result } from '@taskelith/kernel';
import type { ConformanceCase } from '@taskelith/sdlc';
import {
  ACCOUNT_SLOTS_CONFORMANCE,
  COOLDOWN_SOURCES,
  DEFAULT_PROVIDER_CREDENTIAL_CONCURRENCY,
  FIRST_SLOT_REVISION,
  NO_SLOT_POLICIES,
  REDACTED,
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
  parseSlotRequest,
  type AccountSlot,
  type AccountSlots,
  type HarnessPluginId,
  type SubscriptionMechanismId,
  type ProjectId,
  type ProviderCredentialId,
  type SlotCredentials,
  type SlotRequest,
} from '@taskelith/scheduling';

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

function identifier<Kind extends string>(kind: Kind, text: string) {
  const parsed = parseIdentifier(kind, text);
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

// A test double that applies the port rules the suites check.
class InMemoryAccountSlots implements AccountSlots {
  readonly #slots = new Map<ProviderCredentialId, AccountSlot>();

  async add(slot: AccountSlot): Promise<Result<void>> {
    if (this.#slots.has(slot.id)) return err(failure('conflict', 'the slot exists'));
    if (slot.revision !== FIRST_SLOT_REVISION) return err(failure('invalid', 'a new slot starts at the first revision'));
    return this.write(slot);
  }

  async get(id: ProviderCredentialId): Promise<Result<AccountSlot>> {
    const slot = this.#slots.get(id);
    return slot === undefined ? err(failure('not-found', 'no such slot')) : ok(slot);
  }

  async pool(projectId: ProjectId, harnessId: HarnessPluginId): Promise<readonly AccountSlot[]> {
    return [...this.#slots.values()]
      .filter((slot) => slot.state === 'active' && slot.harnessId === harnessId && slot.allowedProjects.includes(projectId))
      .sort((left, right) => (left.id < right.id ? -1 : 1));
  }

  async replace(slot: AccountSlot, expectedRevision: number): Promise<Result<void>> {
    const stored = this.#slots.get(slot.id);
    if (stored === undefined) return err(failure('not-found', 'no such slot'));
    if (slot.harnessId !== stored.harnessId || (stored.state === 'removed' && slot.state !== 'removed')) {
      return err(failure('invalid', 'a slot keeps its harness and its tombstone'));
    }
    if (slot.revision !== expectedRevision + 1) return err(failure('invalid', 'a change moves the revision by one'));
    if (stored.revision !== expectedRevision) return err(failure('conflict', 'the slot revision moved'));
    return this.write(slot);
  }

  protected write(slot: AccountSlot): Result<void> {
    this.#slots.set(slot.id, slot);
    return ok(undefined);
  }
}

class InMemorySlotCredentials implements SlotCredentials {
  readonly #secrets = new Map<ProviderCredentialId, SlotSecret>();

  async store(slotId: ProviderCredentialId, secret: SlotSecret): Promise<void> {
    this.#secrets.set(slotId, secret);
  }

  async reveal(slotId: ProviderCredentialId): Promise<Result<SlotSecret>> {
    const secret = this.#secrets.get(slotId);
    return secret === undefined ? err(failure('not-found', 'no credential for the slot')) : ok(secret);
  }

  async destroy(slotId: ProviderCredentialId): Promise<void> {
    this.#secrets.delete(slotId);
  }
}

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
  override async reveal(slotId: ProviderCredentialId): Promise<Result<SlotSecret>> {
    const revealed = await super.reveal(slotId);
    if (!revealed.ok) return revealed;
    const text = revealed.value.reveal();
    return ok(Object.assign(Object.create(SlotSecret.prototype) as SlotSecret, { reveal: () => text, toJSON: () => text }));
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

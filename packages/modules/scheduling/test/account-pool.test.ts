import assert from 'node:assert/strict';
import test from 'node:test';
import { inspect } from 'node:util';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import {
  ACCOUNT_SLOTS_CONFORMANCE,
  COOLDOWN_SOURCES,
  DEFAULT_SLOT_CONCURRENCY,
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
  type AccountSlot,
  type AccountSlots,
  type HarnessPluginId,
  type ProjectId,
  type ProviderCredentialId,
  type SlotCredentials,
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
  assert.equal(DEFAULT_SLOT_CONCURRENCY, 4);
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
    this.#slots.set(slot.id, slot);
    return ok(undefined);
  }

  async get(id: ProviderCredentialId): Promise<Result<AccountSlot>> {
    const slot = this.#slots.get(id);
    return slot === undefined ? err(failure('not-found', 'no such slot')) : ok(slot);
  }

  async pool(projectId: ProjectId, harness: HarnessPluginId): Promise<readonly AccountSlot[]> {
    return [...this.#slots.values()]
      .filter((slot) => slot.state === 'active' && slot.harness === harness && slot.allowedProjects.includes(projectId))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  async replace(slot: AccountSlot, expectedRevision: number): Promise<Result<void>> {
    const stored = this.#slots.get(slot.id);
    if (stored === undefined) return err(failure('not-found', 'no such slot'));
    if (slot.harness !== stored.harness || (stored.state === 'removed' && slot.state !== 'removed')) {
      return err(failure('invalid', 'a slot keeps its harness and its tombstone'));
    }
    if (stored.revision !== expectedRevision || slot.revision !== expectedRevision + 1) {
      return err(failure('conflict', 'the slot revision moved'));
    }
    this.#slots.set(slot.id, slot);
    return ok(undefined);
  }
}

class InMemorySlotCredentials implements SlotCredentials {
  readonly #secrets = new Map<ProviderCredentialId, SlotSecret>();

  async store(slotId: ProviderCredentialId, secret: SlotSecret): Promise<Result<void>> {
    this.#secrets.set(slotId, secret);
    return ok(undefined);
  }

  async reveal(slotId: ProviderCredentialId): Promise<Result<SlotSecret>> {
    const secret = this.#secrets.get(slotId);
    return secret === undefined ? err(failure('not-found', 'no credential for the slot')) : ok(secret);
  }

  async destroy(slotId: ProviderCredentialId): Promise<Result<void>> {
    this.#secrets.delete(slotId);
    return ok(undefined);
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
class LenientAccountSlots extends InMemoryAccountSlots {
  override async replace(slot: AccountSlot): Promise<Result<void>> {
    return super.add({ ...slot, revision: FIRST_SLOT_REVISION });
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

test('the account slots suite rejects an adapter without compare-and-set', async () => {
  const problems = await Promise.all(ACCOUNT_SLOTS_CONFORMANCE.map((conformance) => conformance.check(new LenientAccountSlots())));
  assert.ok(problems.flat().length > 0);
});

test('the slot credentials suite rejects an adapter that discloses a credential', async () => {
  const problems = await Promise.all(SLOT_CREDENTIALS_CONFORMANCE.map((conformance) => conformance.check(new LeakingSlotCredentials())));
  assert.ok(problems.flat().some((problem) => problem.includes('discloses')));
});

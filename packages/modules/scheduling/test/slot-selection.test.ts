import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { HarnessPluginId } from '@taskelith/execution';
import { parseInstant, type Instant } from '@taskelith/kernel';
import {
  DEFAULT_PROVIDER_CREDENTIAL_CONCURRENCY,
  FIRST_SLOT_REVISION,
  REJECTING_REASONS,
  SLOT_REJECTING_REASONS,
  isRejectingReason,
  lacksFleetCapacity,
  leastLoaded,
  parseSlotCredentialVersion,
  selectNewSessionSlot,
  slotIneligibility,
  triesNextCandidate,
  type AccountSlot,
  type NoSlotPolicy,
  type ProjectId,
  type SlotStanding,
  type SubscriptionMechanismId,
} from '@taskelith/scheduling';
import { id, value } from '@taskelith/testing';

const at = (text: string): Instant => value(parseInstant(text));
const NOW = at('2026-10-29T10:00:00.000Z');
const BEFORE = at('2026-10-29T09:00:00.000Z');
const EARLIER = at('2026-10-29T08:00:00.000Z');
const LATER = at('2026-10-29T11:00:00.000Z');
const LATEST = at('2026-10-29T12:00:00.000Z');
const PROJECT = id('ProjectId', 'project-1') as ProjectId;
const OTHER_PROJECT = id('ProjectId', 'project-2') as ProjectId;
const HARNESS = id('HarnessPluginId', 'harness-1') as HarnessPluginId;

function slot(name: string, overrides: Partial<AccountSlot> = {}): AccountSlot {
  return {
    id: id('ProviderCredentialId', name), harnessId: HARNESS, mechanismId: id('SubscriptionMechanismId', 'mechanism-1') as SubscriptionMechanismId,
    credentialVersion: value(parseSlotCredentialVersion(1)), allowedProjects: [PROJECT],
    concurrencyLimit: DEFAULT_PROVIDER_CREDENTIAL_CONCURRENCY, state: 'active', health: 'healthy', revision: FIRST_SLOT_REVISION,
    ...overrides,
  };
}

const standing = (stored: AccountSlot, held = 0): SlotStanding => ({ slot: stored, held });
const chosen = (standings: readonly SlotStanding[]) => leastLoaded(standings, NOW)?.id;
const select = (standings: readonly SlotStanding[], whenNoSlot: NoSlotPolicy = 'wait') =>
  selectNewSessionSlot({ projectId: PROJECT, whenNoSlot, standings }, NOW);
const usage = (fraction: number, windowEndsAt: Instant = LATER) => ({ usage: { fraction, windowEndsAt } });

test('each ineligibility reason is the first failing check, in contract order', () => {
  const cases: [SlotStanding, string | undefined][] = [
    [standing(slot('s', { state: 'removed', health: 'unhealthy' })), 'removed'],
    [standing(slot('s', { state: 'revoked', health: 'unhealthy' })), 'revoked'],
    [standing(slot('s', { allowedProjects: [OTHER_PROJECT], health: 'unhealthy' })), 'not-allowed'],
    [standing(slot('s', { health: 'unhealthy', cooldown: { until: LATER, source: 'default' } })), 'unhealthy'],
    [standing(slot('s', { cooldown: { until: LATER, source: 'reported-reset' } }), 9), 'cooling-down'],
    [standing(slot('s', { concurrencyLimit: 2 }), 2), 'at-concurrency-limit'],
    // A cooldown ends at its stored end, inclusive.
    [standing(slot('s', { cooldown: { until: NOW, source: 'default' } })), undefined],
    [standing(slot('s', { concurrencyLimit: 8 }), 7), undefined],
  ];
  for (const [given, reason] of cases) assert.equal(slotIneligibility(given, PROJECT, NOW), reason, JSON.stringify(given));
});

test('the slot with the fewest held reservations wins', () => {
  assert.equal(chosen([standing(slot('a'), 2), standing(slot('b'), 0), standing(slot('c'), 1)]), 'b');
});

test('usage breaks a tie only when every tied slot reports within its window', () => {
  const low = slot('b', { ...usage(0.2), lastReservedAt: NOW });
  const high = slot('a', { ...usage(0.7), lastReservedAt: BEFORE });
  assert.equal(chosen([standing(high), standing(low)]), 'b');
  assert.equal(chosen([standing(high), standing(low), standing(slot('c', { ...usage(0) }), 1)]), 'b');
  const noReport = slot('c', { lastReservedAt: EARLIER });
  assert.equal(chosen([standing(high), standing(low), standing(noReport)]), 'c');
  const ended = slot('b', { ...usage(0.2, NOW), lastReservedAt: NOW });
  assert.equal(chosen([standing(high), standing(ended)]), 'a');
});

test('equal usage goes to the least recently reserved slot, a never reserved one first', () => {
  const recent = slot('a', { ...usage(0.5), lastReservedAt: NOW });
  const older = slot('b', { ...usage(0.5), lastReservedAt: BEFORE });
  assert.equal(chosen([standing(recent), standing(older)]), 'b');
  assert.equal(chosen([standing(recent), standing(older), standing(slot('c', usage(0.5)))]), 'c');
});

test('a full tie goes to the lowest identifier in code unit order', () => {
  assert.equal(chosen([standing(slot('b')), standing(slot('a')), standing(slot('Z'))]), 'Z');
  assert.equal(leastLoaded([], NOW), undefined);
});

test('a new session reserves the least-loaded eligible slot and never an ineligible one', () => {
  const full = slot('a', { concurrencyLimit: 1 });
  assert.deepEqual(select([standing(full, 1), standing(slot('b'), 3)]), { outcome: 'reserved', slot: { harnessId: HARNESS, slotId: 'b' } });
});

test('without an eligible slot the policy waits with the earliest cooldown end or rejects', () => {
  const pool = [
    standing(slot('a', { cooldown: { until: LATEST, source: 'default' } })),
    standing(slot('b', { cooldown: { until: LATER, source: 'reported-reset' } })),
    standing(slot('c', { health: 'unhealthy', cooldown: { until: NOW, source: 'default' } })),
    standing(slot('d', { concurrencyLimit: 1 }), 1),
  ];
  assert.deepEqual(select(pool), { outcome: 'waiting', reason: 'provider-concurrency-exhausted', earliestCooldownEnd: LATER });
  assert.deepEqual(select([standing(slot('d', { concurrencyLimit: 1 }), 1)]), { outcome: 'waiting', reason: 'provider-concurrency-exhausted' });
  assert.deepEqual(select(pool, 'reject'), { outcome: 'rejected', reason: 'no-eligible-slot' });
  assert.deepEqual(select([], 'reject'), { outcome: 'rejected', reason: 'no-eligible-slot' });
});

test('the slot reasons are rejecting reasons, and a slot wait is no worker or fleet reason', () => {
  for (const reason of SLOT_REJECTING_REASONS) {
    assert.ok((REJECTING_REASONS as readonly string[]).includes(reason));
    assert.equal(isRejectingReason(reason), true);
  }
  assert.equal(triesNextCandidate('provider-concurrency-exhausted'), false);
  assert.equal(lacksFleetCapacity('provider-concurrency-exhausted'), false);
});

// Contract section 1: no harness or vendor name in the pool's code or tests.
const VENDOR_NAMES = /claude|anthropic|codex|openai|gemini|copilot|cursor|opencode/i;
const MODULE = join(dirname(fileURLToPath(import.meta.url)), '..');
const POOL_FILES = [
  'src/domain/account-slot.ts', 'src/domain/slot-secret.ts', 'src/domain/slot-selection.ts', 'src/domain/least-loaded-selection.ts',
  'src/ports/account-pool.ts', 'src/ports/account-pool-conformance.ts', 'src/adapters/in-memory-account-pool.ts',
  'src/application/add-account-slot.ts', 'src/application/slot-selection-in-transaction.ts',
  'test/account-pool.test.ts', 'test/slot-selection.test.ts', 'test/slot-placement.test.ts',
];

test('the account pool code and tests name no harness or vendor', () => {
  const present = new Set([...readdirSync(join(MODULE, 'src'), { recursive: true }), ...readdirSync(join(MODULE, 'test'))].map(String));
  for (const file of POOL_FILES) {
    assert.ok(present.has(file.replace(/^(src|test)\//, '')), `${file} is missing`);
    const text = readFileSync(join(MODULE, file), 'utf8').replace(VENDOR_NAMES.source, '');
    assert.doesNotMatch(text, VENDOR_NAMES, file);
  }
});

import type { HarnessPluginId } from '@taskelith/execution';
import { err, failure, ok, type Identifier, type Instant, type Result } from '@taskelith/kernel';
import type { ProjectId, ProviderCredentialId } from './capacity-reservation.js';

// Opaque to the pool: no harness or vendor is ever named (contract section 1).
export type SubscriptionMechanismId = Identifier<'SubscriptionMechanismId'>;

declare const slotCredentialVersionBrand: unique symbol;

// Assigned by the store from a per-slot counter, so ordered and never
// reused; a rotation discards only older versions (sections 6.2, 8.1).
export type SlotCredentialVersion = number & { readonly [slotCredentialVersionBrand]: true };

export const SLOT_STATES = Object.freeze(['active', 'revoked', 'removed'] as const);
export const SLOT_HEALTH = Object.freeze(['healthy', 'unhealthy'] as const);
export const COOLDOWN_SOURCES = Object.freeze(['reported-reset', 'default'] as const);

// Contract section 3.2, in the order the checks run.
export const SLOT_INELIGIBILITY_REASONS = Object.freeze([
  'removed',
  'revoked',
  'not-allowed',
  'unhealthy',
  'cooling-down',
  'at-concurrency-limit',
] as const);

export const FIRST_SLOT_REVISION = 1;

// Contract section 5: an installation setting, provisional default.
export const SLOT_COOLDOWN_DEFAULT_MINUTES = Object.freeze({ minimum: 1, maximum: 1440, provisional: 60 });

export type SlotState = (typeof SLOT_STATES)[number];
export type SlotHealth = (typeof SLOT_HEALTH)[number];
export type CooldownSource = (typeof COOLDOWN_SOURCES)[number];
export type SlotIneligibilityReason = (typeof SLOT_INELIGIBILITY_REASONS)[number];

export interface SlotCooldown {
  readonly until: Instant;
  readonly source: CooldownSource;
}

// A fraction from 0 to 1 of the limit of the window that ends at windowEndsAt.
export interface SlotUsage {
  readonly fraction: number;
  readonly windowEndsAt: Instant;
}

export interface AccountSlot {
  readonly id: ProviderCredentialId;
  readonly harnessId: HarnessPluginId;
  readonly mechanismId: SubscriptionMechanismId;
  readonly credentialVersion: SlotCredentialVersion;
  readonly allowedProjects: readonly ProjectId[];
  readonly concurrencyLimit: number;
  readonly state: SlotState;
  readonly health: SlotHealth;
  readonly cooldown?: SlotCooldown;
  readonly usage?: SlotUsage;
  readonly lastReservedAt?: Instant;
  readonly revision: number;
}

// The record invariants of contract section 3.1; the ports store parsed
// records and do not check them again.
export function parseAccountSlot(slot: AccountSlot): Result<AccountSlot> {
  const problem = recordProblem(slot);
  if (problem !== undefined) return err(failure('invalid', problem));
  return ok(Object.freeze({ ...slot, ...frozenParts(slot) }));
}

export function parseSlotCredentialVersion(value: number): Result<SlotCredentialVersion> {
  if (!isPositiveInteger(value)) return err(failure('invalid', 'a credential version must be a positive integer'));
  return ok(value as SlotCredentialVersion);
}

function frozenParts(slot: AccountSlot): Partial<AccountSlot> {
  const { allowedProjects, cooldown, usage } = slot;
  return {
    allowedProjects: Object.freeze([...allowedProjects]),
    ...(cooldown === undefined ? {} : { cooldown: Object.freeze({ ...cooldown }) }),
    ...(usage === undefined ? {} : { usage: Object.freeze({ ...usage }) }),
  };
}

function recordProblem(slot: AccountSlot): string | undefined {
  const { allowedProjects, concurrencyLimit, credentialVersion, usage, revision } = slot;
  if (allowedProjects.length === 0) return 'a slot must allow at least one project';
  if (new Set(allowedProjects).size !== allowedProjects.length) return 'a project is allowed twice';
  if (!isPositiveInteger(concurrencyLimit)) return 'the concurrency limit must be a positive integer';
  if (!isPositiveInteger(credentialVersion)) return 'the credential version must be a positive integer';
  if (!isPositiveInteger(revision)) return 'the revision must be a positive integer';
  if (usage !== undefined && !(usage.fraction >= 0 && usage.fraction <= 1)) return 'usage must be a fraction from 0 to 1';
  return undefined;
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

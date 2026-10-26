import type { Identifier, Instant } from '@taskelith/kernel';
import type { ProjectId, ProviderCredentialId } from './capacity-reservation.js';

// Opaque to the pool: no harness or vendor is ever named (contract section 1).
export type HarnessPluginId = Identifier<'HarnessPluginId'>;
export type SubscriptionMechanismId = Identifier<'SubscriptionMechanismId'>;

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

export const DEFAULT_SLOT_CONCURRENCY = 4;
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
  readonly harness: HarnessPluginId;
  readonly mechanism: SubscriptionMechanismId;
  readonly allowedProjects: readonly ProjectId[];
  readonly concurrencyLimit: number;
  readonly state: SlotState;
  readonly health: SlotHealth;
  readonly cooldown?: SlotCooldown;
  readonly usage?: SlotUsage;
  readonly lastReservedAt?: Instant;
  readonly revision: number;
}

import { createHash } from 'node:crypto';
import { SlotCredentialKeyFile, type ControlPlaneNamespace } from '@taskelith/control-plane-store';
import type { AssignmentId, HarnessPluginId } from '@taskelith/execution';
import { err, failure, ok, type EventId, type Result } from '@taskelith/kernel';
import type { Logger } from '@taskelith/observability';
import { PostgresSlotCredentials, type PostgresDatabase } from '@taskelith/postgres';
import {
  StaticAdmittedDeliveries,
  sweepSlotCredentials,
  type AdmittedPair,
  type DefaultCooldownMinutes,
  type SlotCredentialSweep,
  type SlotCredentials,
  type SubscriptionMechanismId,
} from '@taskelith/scheduling';
import { AesGcmSlotCredentialCipher, RandomIdentifiers } from '@taskelith/secrets';
import { AccountSlotService, type SlotProjects } from '../application/account-slot-service.js';
import type { ControlPlaneStore } from '../application/control-plane-store.js';
import { SlotCredentialDeliveryService } from '../application/slot-credential-delivery.js';
import { SlotSignals } from '../application/slot-signals.js';

export const CLAUDE_CODE_HARNESS_ID = 'claude-code';

// Account pool contract section 7.1: one Claude Code subscription-token
// slot; every other mechanism and harness has no admitted delivery.
export const ADMITTED_SLOT_DELIVERIES: readonly AdmittedPair[] = Object.freeze([
  Object.freeze({
    harnessId: CLAUDE_CODE_HARNESS_ID as HarnessPluginId, mechanismId: 'subscription-token' as SubscriptionMechanismId,
    delivery: 'subscription-token', slotLimit: 1,
  }),
]);

// How often the sweep of section 8.1 runs (decision Q8, provisional).
export const SLOT_CREDENTIAL_SWEEP_MILLISECONDS = 3_600_000;

export interface AccountPoolPorts {
  readonly store: ControlPlaneStore;
  readonly credentials: SlotCredentials;
  readonly projects: SlotProjects;
  readonly defaultCooldown: DefaultCooldownMinutes;
}

export interface AccountPoolServices {
  readonly slots: AccountSlotService;
  readonly delivery: SlotCredentialDeliveryService;
  readonly signals: SlotSignals;
  // Never rejects: what a failed sweep leaves, the next one sweeps.
  sweep(): Promise<Result<SlotCredentialSweep>>;
}

export interface AccountPoolStartPorts {
  readonly namespace: ControlPlaneNamespace;
  readonly database: PostgresDatabase;
  readonly projects: SlotProjects;
  readonly defaultCooldown: DefaultCooldownMinutes;
}

// The pool over PostgreSQL with the key that initialization created; a
// missing or malformed key refuses the start and is never created here.
export function startAccountPoolServices({ namespace, database, projects, defaultCooldown }: AccountPoolStartPorts): Result<AccountPoolServices> {
  const key = new SlotCredentialKeyFile(namespace).read();
  if (!key.ok) return key;
  const cipher = AesGcmSlotCredentialCipher.of(key.value);
  if (!cipher.ok) return cipher;
  const credentials = new PostgresSlotCredentials((work) => database.transaction(work), cipher.value);
  return ok(accountPoolServices({ store: database, credentials, projects, defaultCooldown }));
}

export function accountPoolServices({ store, credentials, projects, defaultCooldown }: AccountPoolPorts): AccountPoolServices {
  const deliveries = new StaticAdmittedDeliveries(ADMITTED_SLOT_DELIVERIES);
  const ids = new RandomIdentifiers();
  const slots = new AccountSlotService({
    store, credentials, deliveries, projects, newSlotId: () => ids.newSlotId(),
    monotonicMilliseconds: () => performance.now(), revocationCommandIdFor: slotRevocationCommandId,
  });
  return {
    slots,
    delivery: new SlotCredentialDeliveryService(store, { credentials, admittedDeliveries: deliveries }),
    signals: new SlotSignals(defaultCooldown),
    sweep: () => settledSweep(() => sweepSlotCredentials({ store, credentials })),
  };
}

// The end command of a holder's assignment: stable for a rerun, and not
// the one a worker revocation sends (decision 14).
export function slotRevocationCommandId(assignmentId: AssignmentId): EventId {
  return `v${createHash('sha256').update(JSON.stringify([assignmentId, 'slot-revocation'])).digest('hex')}` as EventId;
}

export function logSlotCredentialSweep(logger: Logger, sweep: Result<SlotCredentialSweep>): void {
  if (!sweep.ok) logger.warn('scheduling.slot-credentials.sweep-failed', { code: sweep.error.code, message: sweep.error.message });
}

async function settledSweep(sweep: () => Promise<Result<SlotCredentialSweep>>): Promise<Result<SlotCredentialSweep>> {
  try {
    return await sweep();
  } catch {
    return err(failure('unavailable', 'the slot credential sweep did not finish'));
  }
}

import type { ExecutionId, HarnessPluginId } from '@taskelith/execution';
import { err, failure, instantFromEpochMilliseconds, ok, type Instant, type Result } from '@taskelith/kernel';
import type { TaskId } from '@taskelith/sdlc';
import {
  FIRST_SLOT_REVISION,
  parseSlotCredentialVersion,
  type AccountSlot,
  type SlotCredentialVersion,
  type SubscriptionMechanismId,
} from '../domain/account-slot.js';
import { byCodeUnits } from '../domain/code-unit-order.js';
import type { ProjectId, ProviderCredentialId } from '../domain/capacity-reservation.js';
import type { SlotDeliveryRecord } from '../domain/slot-credential-delivery.js';
import type { SlotSecret } from '../domain/slot-secret.js';
import type { SlotCredentialDeliveries } from '../ports/slot-credential-deliveries.js';
import type {
  AccountSlots,
  AdmittedDeliveries,
  AdmittedDelivery,
  SlotCredentials,
  StoredSlotCredential,
} from '../ports/account-pool.js';

// Test doubles of the account pool ports, with the rules their suites check.
export class InMemoryAccountSlots implements AccountSlots {
  readonly #slots = new Map<ProviderCredentialId, AccountSlot>();

  async add(slot: AccountSlot): Promise<Result<void>> {
    if (this.#slots.has(slot.id)) return err(failure('conflict', 'the slot exists', { slot: slot.id }));
    if (slot.revision !== FIRST_SLOT_REVISION) return err(failure('invalid', 'a new slot starts at the first revision'));
    return this.write(slot);
  }

  async get(id: ProviderCredentialId): Promise<Result<AccountSlot>> {
    const slot = this.#slots.get(id);
    return slot === undefined ? err(failure('not-found', 'no such slot', { slot: id })) : ok(slot);
  }

  async pool(projectId: ProjectId, harnessId: HarnessPluginId): Promise<readonly AccountSlot[]> {
    return [...this.#slots.values()]
      .filter((slot) => slot.state === 'active' && slot.harnessId === harnessId && slot.allowedProjects.includes(projectId))
      .sort((left, right) => byCodeUnits(left.id, right.id));
  }

  async replace(slot: AccountSlot, expectedRevision: number): Promise<Result<void>> {
    const stored = this.#slots.get(slot.id);
    if (stored === undefined) return err(failure('not-found', 'no such slot', { slot: slot.id }));
    if (slot.harnessId !== stored.harnessId || (stored.state === 'removed' && slot.state !== 'removed')) {
      return err(failure('invalid', 'a slot keeps its harness and its tombstone'));
    }
    if (slot.revision !== expectedRevision + 1) return err(failure('invalid', 'a change moves the revision by one'));
    if (stored.revision !== expectedRevision) return err(failure('conflict', 'the slot revision moved', { slot: slot.id }));
    return this.write(slot);
  }

  async countNotRemoved(harnessId: HarnessPluginId): Promise<number> {
    return [...this.#slots.values()].filter((slot) => slot.harnessId === harnessId && slot.state !== 'removed').length;
  }

  protected write(slot: AccountSlot): Result<void> {
    this.#slots.set(slot.id, slot);
    return ok(undefined);
  }
}

// The clock of a store's time; tests pass their own.
export type SlotCredentialClock = () => Instant;

export class InMemorySlotCredentials implements SlotCredentials {
  protected readonly versions = new Map<ProviderCredentialId, Map<SlotCredentialVersion, SlotSecret>>();
  protected readonly destroyed = new Set<ProviderCredentialId>();
  readonly #lastVersions = new Map<ProviderCredentialId, number>();
  readonly #storedAt = new Map<string, Instant>();
  readonly #now: SlotCredentialClock;

  constructor(now: SlotCredentialClock = systemNow) {
    this.#now = now;
  }

  async store(slotId: ProviderCredentialId, secret: SlotSecret): Promise<SlotCredentialVersion> {
    const version = this.nextVersion(slotId);
    if (!this.destroyed.has(slotId)) {
      this.versionsOf(slotId).set(version, secret);
      this.#storedAt.set(storedKey(slotId, version), this.#now());
    }
    return version;
  }

  async listStored(storedBefore: Instant): Promise<readonly StoredSlotCredential[]> {
    const before = Date.parse(storedBefore);
    const listed = [...this.versions].flatMap(([slotId, stored]) => [...stored.keys()]
      .filter((version) => Date.parse(this.#storedAt.get(storedKey(slotId, version)) ?? storedBefore) < before)
      .map((version) => Object.freeze({ slotId, version })));
    return Object.freeze(listed.sort((left, right) => byCodeUnits(left.slotId, right.slotId) || left.version - right.version));
  }

  async reveal(slotId: ProviderCredentialId, version: SlotCredentialVersion): Promise<Result<SlotSecret>> {
    const secret = this.versions.get(slotId)?.get(version);
    return secret === undefined ? err(failure('not-found', 'no such credential version', { slot: slotId })) : ok(secret);
  }

  async discard(slotId: ProviderCredentialId, version: SlotCredentialVersion): Promise<void> {
    this.versions.get(slotId)?.delete(version);
  }

  async discardOlderThan(slotId: ProviderCredentialId, version: SlotCredentialVersion): Promise<void> {
    const stored = this.versionsOf(slotId);
    for (const older of stored.keys()) if (older < version) stored.delete(older);
  }

  async destroy(slotId: ProviderCredentialId): Promise<void> {
    this.destroyed.add(slotId);
    this.versions.delete(slotId);
  }

  // The versions a slot still holds, for tests of what a command left.
  storedVersions(slotId: ProviderCredentialId): readonly SlotCredentialVersion[] {
    return [...(this.versions.get(slotId)?.keys() ?? [])];
  }

  protected nextVersion(slotId: ProviderCredentialId): SlotCredentialVersion {
    const next = (this.#lastVersions.get(slotId) ?? 0) + 1;
    this.#lastVersions.set(slotId, next);
    const version = parseSlotCredentialVersion(next);
    if (!version.ok) throw new Error(version.error.message);
    return version.value;
  }

  protected versionsOf(slotId: ProviderCredentialId): Map<SlotCredentialVersion, SlotSecret> {
    const stored = this.versions.get(slotId) ?? new Map<SlotCredentialVersion, SlotSecret>();
    this.versions.set(slotId, stored);
    return stored;
  }
}

function storedKey(slotId: ProviderCredentialId, version: SlotCredentialVersion): string {
  return JSON.stringify([slotId, version]);
}

function systemNow(): Instant {
  const now = instantFromEpochMilliseconds(Date.now());
  if (!now.ok) throw new Error(now.error.message);
  return now.value;
}

export interface AdmittedPair extends AdmittedDelivery {
  readonly harnessId: HarnessPluginId;
  readonly mechanismId: SubscriptionMechanismId;
}

// A fixed list of admitted pairs, as the control plane keeps them.
export class StaticAdmittedDeliveries implements AdmittedDeliveries {
  readonly #pairs: readonly AdmittedPair[];

  constructor(pairs: readonly AdmittedPair[]) {
    this.#pairs = Object.freeze([...pairs]);
  }

  async find(harnessId: HarnessPluginId, mechanismId: SubscriptionMechanismId): Promise<AdmittedDelivery | undefined> {
    const pair = this.#pairs.find((candidate) => candidate.harnessId === harnessId && candidate.mechanismId === mechanismId);
    return pair === undefined ? undefined : { delivery: pair.delivery, ...(pair.slotLimit === undefined ? {} : { slotLimit: pair.slotLimit }) };
  }
}

// Delivery records by task, execution, and slot, as the table keys them.
export class InMemorySlotCredentialDeliveries implements SlotCredentialDeliveries {
  readonly #records = new Map<string, SlotDeliveryRecord>();

  async find(taskId: TaskId, executionId: ExecutionId, slotId: ProviderCredentialId): Promise<SlotDeliveryRecord | undefined> {
    return this.#records.get(deliveryKey(taskId, executionId, slotId));
  }

  async listByExecution(taskId: TaskId, executionId: ExecutionId): Promise<readonly SlotDeliveryRecord[]> {
    const records = [...this.#records.values()].filter((record) => record.taskId === taskId && record.executionId === executionId);
    return Object.freeze(records.sort((left, right) => byCodeUnits(left.slotId, right.slotId)));
  }

  async record(delivery: SlotDeliveryRecord): Promise<void> {
    this.#records.set(deliveryKey(delivery.taskId, delivery.executionId, delivery.slotId), delivery);
  }
}

function deliveryKey(taskId: TaskId, executionId: ExecutionId, slotId: ProviderCredentialId): string {
  return JSON.stringify([taskId, executionId, slotId]);
}

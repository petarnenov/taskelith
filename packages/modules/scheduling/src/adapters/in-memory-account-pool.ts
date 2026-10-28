import type { HarnessPluginId } from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import {
  FIRST_SLOT_REVISION,
  parseSlotCredentialVersion,
  type AccountSlot,
  type SlotCredentialVersion,
  type SubscriptionMechanismId,
} from '../domain/account-slot.js';
import { byCodeUnits } from '../domain/code-unit-order.js';
import type { ProjectId, ProviderCredentialId } from '../domain/capacity-reservation.js';
import type { SlotSecret } from '../domain/slot-secret.js';
import type { AccountSlots, AdmittedDeliveries, AdmittedDelivery, SlotCredentials } from '../ports/account-pool.js';

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

export class InMemorySlotCredentials implements SlotCredentials {
  protected readonly versions = new Map<ProviderCredentialId, Map<SlotCredentialVersion, SlotSecret>>();
  protected readonly destroyed = new Set<ProviderCredentialId>();
  readonly #lastVersions = new Map<ProviderCredentialId, number>();

  async store(slotId: ProviderCredentialId, secret: SlotSecret): Promise<SlotCredentialVersion> {
    const version = this.nextVersion(slotId);
    if (!this.destroyed.has(slotId)) this.versionsOf(slotId).set(version, secret);
    return version;
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

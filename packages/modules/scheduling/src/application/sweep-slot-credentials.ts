import { err, failure, instantFromEpochMilliseconds, ok, type Result } from '@taskelith/kernel';
import type { AccountSlot, SlotCredentialVersion } from '../domain/account-slot.js';
import type { ProviderCredentialId } from '../domain/capacity-reservation.js';
import type { SlotCredentials, StoredSlotCredential } from '../ports/account-pool.js';
import type { CapacityStore } from '../ports/capacity-store.js';

// The least age of a stored version that the sweep may discard, so that an
// add-slot command between its store and its add keeps its version.
export const SLOT_CREDENTIAL_SWEEP_MINIMUM_GRACE_MILLISECONDS = 3_600_000;

export interface SlotCredentialSweepPorts {
  readonly store: CapacityStore;
  readonly credentials: SlotCredentials;
}

// The listed slots by outcome; a failed slot is swept again next time.
export interface SlotCredentialSweep {
  readonly sweptSlots: readonly ProviderCredentialId[];
  readonly failedSlots: readonly ProviderCredentialId[];
}

// Section 8.1: versions older than the grace age are swept per slot by the
// record that names the slot.
export async function sweepSlotCredentials(
  ports: SlotCredentialSweepPorts,
  graceMilliseconds = SLOT_CREDENTIAL_SWEEP_MINIMUM_GRACE_MILLISECONDS,
): Promise<Result<SlotCredentialSweep>> {
  if (!Number.isSafeInteger(graceMilliseconds) || graceMilliseconds < SLOT_CREDENTIAL_SWEEP_MINIMUM_GRACE_MILLISECONDS) {
    return err(failure('invalid', `the sweep grace age must be at least ${SLOT_CREDENTIAL_SWEEP_MINIMUM_GRACE_MILLISECONDS} ms`));
  }
  const now = await ports.store.transaction(async (tx) => ok(await tx.now()));
  if (!now.ok) return now;
  const storedBefore = instantFromEpochMilliseconds(Date.parse(now.value) - graceMilliseconds);
  if (!storedBefore.ok) return storedBefore;
  const sweep = { sweptSlots: [] as ProviderCredentialId[], failedSlots: [] as ProviderCredentialId[] };
  for (const [slotId, versions] of groupBySlot(await ports.credentials.listStored(storedBefore.value))) {
    const record = await ports.store.transaction((tx) => namingRecord(tx.accountSlots.get(slotId)));
    if (!record.ok) return record;
    const swept = await settled(() => sweepSlot(ports.credentials, slotId, versions, record.value));
    (swept ? sweep.sweptSlots : sweep.failedSlots).push(slotId);
  }
  return ok(sweep);
}

// Whether the work settled; a rejection leaves the slot to the next sweep.
async function settled(work: () => Promise<void>): Promise<boolean> {
  try {
    await work();
    return true;
  } catch {
    return false;
  }
}

// A slot without a record loses its listed versions only, so a version
// stored within the grace age stays for the add that stored it.
async function sweepSlot(
  credentials: SlotCredentials,
  slotId: ProviderCredentialId,
  versions: readonly SlotCredentialVersion[],
  record: AccountSlot | undefined,
): Promise<void> {
  if (record === undefined) {
    for (const version of versions) await credentials.discard(slotId, version);
  } else if (record.state === 'removed') {
    await credentials.destroy(slotId);
  } else {
    await credentials.discardOlderThan(slotId, record.credentialVersion);
  }
}

async function namingRecord(read: Promise<Result<AccountSlot>>): Promise<Result<AccountSlot | undefined>> {
  const stored = await read;
  if (stored.ok) return stored;
  return stored.error.code === 'not-found' ? ok(undefined) : stored;
}

function groupBySlot(stored: readonly StoredSlotCredential[]): Map<ProviderCredentialId, SlotCredentialVersion[]> {
  const grouped = new Map<ProviderCredentialId, SlotCredentialVersion[]>();
  for (const { slotId, version } of stored) grouped.set(slotId, [...(grouped.get(slotId) ?? []), version]);
  return grouped;
}

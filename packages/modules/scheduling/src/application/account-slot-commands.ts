import { executionsUnderAssignment, type AssignmentId } from '@taskelith/execution';
import { err, failure, ok, type CorrelationId, type EventId, type Result } from '@taskelith/kernel';
import { parseAccountSlot, type AccountSlot, type SlotCredentialVersion } from '../domain/account-slot.js';
import type { Assignment } from '../domain/assignment.js';
import type { ProjectId, ProviderCredentialId } from '../domain/capacity-reservation.js';
import type { SlotSecret } from '../domain/slot-secret.js';
import type { SlotCredentials } from '../ports/account-pool.js';
import type { CapacityStore, CapacityTransaction } from '../ports/capacity-store.js';
import { cancelInTransaction } from './capacity-operations.js';
import { invalidateLaunches, type InvalidationTransaction } from './launch-invalidation.js';

// The slot commands of account pool contract section 8 besides adding; the
// Access module checked the installation owner's role before each one.

export interface UpdateAccountSlotInput {
  readonly id: ProviderCredentialId;
  readonly allowedProjects?: readonly ProjectId[];
  readonly concurrencyLimit?: number;
}

export interface RevokeAccountSlotInput {
  readonly id: ProviderCredentialId;
  readonly correlationId: CorrelationId;
}

export interface RotateSlotCredentialInput {
  readonly id: ProviderCredentialId;
  readonly secret: SlotSecret;
}

// The revoke transaction also reads and revokes the grant index.
export interface SlotRevocationStore {
  transaction<Value>(work: (transaction: InvalidationTransaction) => Promise<Result<Value>>): Promise<Result<Value>>;
}

// The end command of a holder's assignment, derived from it so that a rerun
// sends the same one, and bounded for every valid assignment identifier.
export type RevocationCommandIds = (assignmentId: AssignmentId) => EventId;

export interface SlotRevocationPorts {
  readonly store: SlotRevocationStore;
  readonly commandIdFor: RevocationCommandIds;
}

export interface SlotCredentialCommandPorts {
  readonly store: CapacityStore;
  readonly credentials: SlotCredentials;
}

// A revoked slot keeps its settings until it is reinstated (coordinator Q2).
export function updateAccountSlot(store: CapacityStore, input: UpdateAccountSlotInput): Promise<Result<AccountSlot>> {
  const { id, allowedProjects, concurrencyLimit } = input;
  if (allowedProjects === undefined && concurrencyLimit === undefined) {
    return Promise.resolve(err(failure('invalid', `the update of slot ${id} names no change`, { slot: id })));
  }
  return store.transaction(async (tx) => {
    const stored = await commandSlot(tx, id);
    if (!stored.ok) return stored;
    if (stored.value.state === 'revoked') return err(revokedConflict(id));
    const changes = { allowedProjects: allowedProjects ?? stored.value.allowedProjects, concurrencyLimit: concurrencyLimit ?? stored.value.concurrencyLimit };
    if (sameSettings(stored.value, changes)) return stored;
    return replaceSlot(tx, stored.value, changes);
  });
}

// Section 8.1: the slot leaves its pools and every attempt that holds it is
// cancelled in the same transaction; a revoked slot is answered unchanged.
export function revokeAccountSlot(ports: SlotRevocationPorts, input: RevokeAccountSlotInput): Promise<Result<AccountSlot>> {
  return ports.store.transaction(async (tx) => {
    const stored = await commandSlot(tx, input.id);
    if (!stored.ok || stored.value.state === 'revoked') return stored;
    const revoked = await replaceSlot(tx, stored.value, { state: 'revoked' });
    if (!revoked.ok) return revoked;
    for (const holder of await tx.assignments.listHeldForCredential(input.id)) {
      const identity = { commandId: ports.commandIdFor(holder.id), correlationId: input.correlationId };
      const cancelled = await cancelHolder(tx, holder, identity);
      if (!cancelled.ok) return cancelled;
    }
    return revoked;
  });
}

// Section 8: back to its pools with its health, cooldown, and usage.
export function reinstateAccountSlot(store: CapacityStore, id: ProviderCredentialId): Promise<Result<AccountSlot>> {
  return store.transaction(async (tx) => {
    const stored = await commandSlot(tx, id);
    if (!stored.ok || stored.value.state === 'active') return stored;
    return replaceSlot(tx, stored.value, { state: 'active' });
  });
}

// Section 8: the record stays as a tombstone; destroy runs after the commit,
// and the sweep destroys what a failed or unconfirmed one leaves.
export async function removeAccountSlot(ports: SlotCredentialCommandPorts, id: ProviderCredentialId): Promise<Result<AccountSlot>> {
  const removed = await ports.store.transaction(async (tx) => {
    const stored = await commandSlot(tx, id);
    return stored.ok ? replaceSlot(tx, stored.value, { state: 'removed' }) : stored;
  });
  if (removed.ok) await settled(() => ports.credentials.destroy(id));
  return removed;
}

// Section 8.1: store, then switch by compare-and-set on what was read; the
// answer is the switch, and a failed cleanup is left to the sweep.
export async function rotateSlotCredential(ports: SlotCredentialCommandPorts, input: RotateSlotCredentialInput): Promise<Result<AccountSlot>> {
  const read = await ports.store.transaction((tx) => rotatableSlot(tx, input.id));
  if (!read.ok) return read;
  const version = await ports.credentials.store(input.id, input.secret);
  const switched = await ports.store.transaction((tx) => switchCredential(tx, read.value, version));
  if (switched.ok) await cleanUpAfterSwitch(ports, switched.value);
  return switched;
}

// A removed slot is a tombstone that no command changes (coordinator Q2).
async function commandSlot(tx: CapacityTransaction, id: ProviderCredentialId): Promise<Result<AccountSlot>> {
  const stored = await tx.accountSlots.get(id);
  if (!stored.ok || stored.value.state !== 'removed') return stored;
  return err(failure('not-found', `slot ${id} is removed`, { slot: id }));
}

async function replaceSlot(tx: CapacityTransaction, stored: AccountSlot, changes: Partial<AccountSlot>): Promise<Result<AccountSlot>> {
  const next = parseAccountSlot({ ...stored, ...changes, revision: stored.revision + 1 });
  if (!next.ok) return next;
  const replaced = await tx.accountSlots.replace(next.value, stored.revision);
  return replaced.ok ? next : replaced;
}

// The allowed projects are a set, so their order is no change.
function sameSettings(stored: AccountSlot, { allowedProjects, concurrencyLimit }: Pick<AccountSlot, 'allowedProjects' | 'concurrencyLimit'>): boolean {
  const [requested, current] = [sortedProjects(allowedProjects), sortedProjects(stored.allowedProjects)];
  const sameProjects = requested.length === current.length && requested.every((projectId, index) => projectId === current[index]);
  return sameProjects && concurrencyLimit === stored.concurrencyLimit;
}

function sortedProjects(projects: readonly ProjectId[]): readonly ProjectId[] {
  return [...projects].sort();
}

// An attempt whose execution can run keeps its reservation until that
// execution's terminal fact; any other attempt is released now.
async function cancelHolder(tx: InvalidationTransaction, holder: Assignment, identity: CommandIdentity): Promise<Result<void>> {
  const task = await tx.tasks.get(holder.reservation.scope.taskId);
  if (!task.ok) return task;
  if (executionsUnderAssignment(task.value, holder.id).nonTerminal) {
    const predicate = { kind: 'assignment', assignmentId: holder.id } as const;
    const invalidated = await invalidateLaunches(tx, { predicate, reason: 'attempt-not-launchable', correlationId: identity.correlationId });
    return invalidated.ok ? ok(undefined) : invalidated;
  }
  if (holder.state === 'ended') return ok(undefined);
  const cancelled = await cancelInTransaction(tx, { assignmentId: holder.id, ...identity });
  return cancelled.ok ? ok(undefined) : cancelled;
}

interface CommandIdentity {
  readonly commandId: EventId;
  readonly correlationId: CorrelationId;
}

// Section 8.1: only a revoked slot is rotated; its version and revision are
// read before the store, so the switch can compare them.
async function rotatableSlot(tx: CapacityTransaction, id: ProviderCredentialId): Promise<Result<AccountSlot>> {
  const stored = await commandSlot(tx, id);
  if (!stored.ok || stored.value.state === 'revoked') return stored;
  return err(failure('conflict', `slot ${id} must be revoked before its credential is rotated`, { slot: id }));
}

// A reinstatement, removal, or rotation since the read loses the
// compare-and-set with `conflict` (section 9, rotation test).
async function switchCredential(tx: CapacityTransaction, read: AccountSlot, version: SlotCredentialVersion): Promise<Result<AccountSlot>> {
  const stored = await tx.accountSlots.get(read.id);
  if (!stored.ok) return stored;
  const { state, revision, credentialVersion } = stored.value;
  if (state !== 'revoked' || revision !== read.revision || credentialVersion !== read.credentialVersion) {
    return err(failure('conflict', `slot ${read.id} changed while its credential was rotated`, { slot: read.id }));
  }
  if (await tx.ledger.heldForCredential(read.id) > 0) {
    return err(failure('conflict', `slot ${read.id} still has held reservations`, { slot: read.id }));
  }
  return replaceSlot(tx, stored.value, { credentialVersion: version, health: 'healthy' });
}

// The advance changes nothing but the revision; its conflict means another
// command moved the revision already (section 8.1).
async function cleanUpAfterSwitch(ports: SlotCredentialCommandPorts, switched: AccountSlot): Promise<void> {
  const discarded = await settled(() => ports.credentials.discardOlderThan(switched.id, switched.credentialVersion));
  if (discarded) await settled(() => ports.store.transaction((tx) => replaceSlot(tx, switched, {})));
}

// Whether the work settled; what a rejection leaves is the sweep's.
async function settled(work: () => Promise<unknown>): Promise<boolean> {
  try {
    await work();
    return true;
  } catch {
    return false;
  }
}

function revokedConflict(id: ProviderCredentialId) {
  return failure('conflict', `slot ${id} is revoked`, { slot: id });
}

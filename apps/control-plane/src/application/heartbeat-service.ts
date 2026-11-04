import type { JournalId, WorkerId } from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { ControlPlaneStore, ControlPlaneTransaction } from './control-plane-store.js';
import { recordCurrentContact } from './journal-reconciliation.js';

// The queue group in which control-plane instances share the heartbeats.
export const HEARTBEAT_QUEUE = 'control-plane-heartbeats';

// A heartbeat as the receiver delivers it, its WorkerHeartbeat schema
// already checked.
export interface HeartbeatMessage {
  // The worker that the subject it arrived on names, if any.
  readonly subjectWorkerId: string | undefined;
  readonly body: Readonly<Record<string, unknown>>;
}

// An authenticated heartbeat records contact at the database time; one
// that is not, a new journal's included, changes nothing: `forbidden`.
export class HeartbeatService {
  readonly #store: ControlPlaneStore;

  constructor(store: ControlPlaneStore) {
    this.#store = store;
  }

  record(message: HeartbeatMessage): Promise<Result<void>> {
    return this.#store.transaction((tx) => recordContact(tx, message));
  }
}

async function recordContact(tx: ControlPlaneTransaction, message: HeartbeatMessage): Promise<Result<void>> {
  const workerId = message.body['workerId'] as WorkerId;
  const producer = { subjectWorkerId: message.subjectWorkerId, workerId, journalId: message.body['journalId'] as JournalId };
  const recorded = await recordCurrentContact(tx, producer);
  if (!recorded.ok) return recorded;
  return recorded.value ? ok(undefined) : err(failure('forbidden', `the heartbeat of ${workerId} is not authenticated`, { worker: workerId }));
}

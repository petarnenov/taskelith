import type { WorkerId } from '@taskelith/execution';
import { err, failure, type Result } from '@taskelith/kernel';
import type { ControlPlaneStore, ControlPlaneTransaction } from './control-plane-store.js';
import { isAuthenticProducer } from './producer-authentication.js';

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
// that is not changes nothing and is `forbidden`.
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
  const claim = { subjectWorkerId: message.subjectWorkerId, workerId, journalId: message.body['journalId'] as string };
  const authentic = await isAuthenticProducer(tx, claim);
  if (!authentic.ok) return authentic;
  if (!authentic.value) return err(failure('forbidden', `the heartbeat of ${workerId} is not authenticated`, { worker: workerId }));
  return tx.reports.recordContact(workerId, await tx.now());
}

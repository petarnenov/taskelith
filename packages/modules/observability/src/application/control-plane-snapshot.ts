import { measurement } from '../domain/signals.js';
import type { ControlPlaneSignals, ControlPlaneSnapshot } from '../ports/control-plane-signals.js';
import type { Metrics } from '../ports/metrics.js';
import type { Logger } from './logger.js';

export function recordControlPlaneSnapshot(snapshot: ControlPlaneSnapshot, metrics: Metrics): void {
  metrics.record(measurement('outbox.lag', snapshot.outboxLagSeconds));
  metrics.record(measurement('outbox.pending', snapshot.outboxPending));
  metrics.record(measurement('assignment.age', snapshot.assignmentAgeSeconds));
  metrics.record(measurement('assignment.offered', snapshot.offeredAssignments));
  metrics.record(measurement('execution.unknown', snapshot.unknownExecutions));
  metrics.record(measurement('worker.capacity.slots', snapshot.eligibleSlots));
  metrics.record(measurement('worker.capacity.held', snapshot.heldSlots));
}

// Reads one snapshot and records it; a failed read is logged and records
// nothing, so a stale gauge keeps its last value.
export async function sampleControlPlane(signals: ControlPlaneSignals, metrics: Metrics, logger: Logger): Promise<void> {
  const snapshot = await signals.read();
  if (snapshot.ok) recordControlPlaneSnapshot(snapshot.value, metrics);
  else logger.warn('observability.sample.failed', { code: snapshot.error.code, message: snapshot.error.message });
}

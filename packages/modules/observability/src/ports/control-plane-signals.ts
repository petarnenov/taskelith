import type { Result } from '@taskelith/kernel';

// The signals read from the control plane's state at one moment. An age is 0
// when nothing waits.
export interface ControlPlaneSnapshot {
  readonly outboxLagSeconds: number;
  readonly outboxPending: number;
  readonly assignmentAgeSeconds: number;
  readonly offeredAssignments: number;
  readonly unknownExecutions: number;
  readonly eligibleSlots: number;
  readonly heldSlots: number;
}

export interface ControlPlaneSignals {
  read(): Promise<Result<ControlPlaneSnapshot>>;
}

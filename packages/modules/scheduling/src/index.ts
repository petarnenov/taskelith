export {
  ASSIGNMENT_END_REASONS,
  ASSIGNMENT_STATES,
  ASSIGNMENT_TRANSITIONS,
  REFUSAL_REASONS,
  acceptAssignment,
  createAssignment,
  endAssignment,
  isReservationHeldFor,
  launchAssignment,
  launchReservation,
  reconcileByOperator,
  refuseAssignment,
  releaseAfterTerminalFact,
  supersedeAssignment,
  type Assignment,
  type AssignmentEnd,
  type AssignmentEndReason,
  type AssignmentInput,
  type AssignmentState,
  type Refusal,
  type RefusalReason,
} from './domain/assignment.js';
export {
  HARD_CONTROLS,
  RELEASE_JUSTIFICATIONS,
  RESERVATION_STATES,
  parseResourceRequest,
  type CapacityReservation,
  type HardControl,
  type ProjectId,
  type ProviderCredentialId,
  type ReleaseJustification,
  type ReservationId,
  type ReservationScope,
  type ReservationState,
  type ReservationValues,
  type ResourceRequest,
  type ResourceRequestInput,
  type RunId,
} from './domain/capacity-reservation.js';
export {
  REACHABILITY_STATES,
  firstContact,
  recordContact,
  recordContactLost,
  type ReachabilityState,
  type WorkerReachability,
} from './domain/reachability.js';
export { InMemoryAssignmentRepository } from './adapters/in-memory-assignment-repository.js';
export {
  InMemoryCapacityLedger,
  InMemoryInstallationGuard,
  InMemoryPlacementWorkers,
  InMemoryQuotaSettings,
  InMemoryTaskLineage,
} from './adapters/in-memory-capacity.js';
export {
  CAPACITY_LEDGER_CONFORMANCE,
  CHILD_LINK,
  PLACEMENT_WORKERS_CONFORMANCE,
  PLACEMENT_WORKER_FIXTURES,
  QUOTA_FIXTURES,
  QUOTA_SETTINGS_CONFORMANCE,
  ROOT_LINK,
  TASK_LINEAGE_CONFORMANCE,
  type CapacityLedgerConformanceTarget,
} from './ports/capacity-conformance.js';
export type { AssignmentRepository } from './ports/assignment-repository.js';
export type { Outbox, OutboxMessage } from './ports/outbox.js';
// The outbox ports are structurally identical, so they share one suite.
export { OUTBOX_CONFORMANCE } from '@taskelith/sdlc';
export { ASSIGNMENT_REPOSITORY_CONFORMANCE } from './ports/repository-conformance.js';
export { admitDelegation, type DelegationRequest } from './application/delegation-admission.js';
export {
  cancelInTransaction,
  placeInTransaction,
  releaseInTransaction,
  supersedeInTransaction,
  type PlacementOutcome,
  type PlacementRequest,
  type ReleaseRequest,
} from './application/capacity-operations.js';
export type { CommandIdentity, WorkerCommandType } from './application/capacity-commands.js';
export {
  invalidateLaunches,
  invalidateWorkerLaunches,
  type Invalidation,
  type InvalidationTransaction,
} from './application/launch-invalidation.js';
export { ResourceAdmissionService, type RetryTiming } from './application/resource-admission-service.js';
export {
  ADMISSION_PRESSURE_SUPERSESSION_BOUND_MILLISECONDS,
  DEFAULT_PROJECT_QUOTA,
  DEFAULT_PROVIDER_CREDENTIAL_CONCURRENCY,
  DEFAULT_RUN_QUOTA,
  DELEGATION_CAPACITY_WAIT_BOUND_MILLISECONDS,
  MAX_ATTEMPT_CPU_MILLICORES,
  MAX_ATTEMPT_MEMORY_MEBIBYTES,
  MAX_AUTOMATIC_RETRIES,
  MAX_DELEGATION_DEPTH,
  MAX_TREE_ATTEMPTS,
  PLACEMENT_BACKOFF_INITIAL_MILLISECONDS,
  PLACEMENT_BACKOFF_MAX_MILLISECONDS,
  PLACEMENT_RETRY_ATTEMPTS,
  UNACKNOWLEDGED_SUPERSESSION_BOUND_MILLISECONDS,
} from './domain/capacity-limits.js';
export {
  REJECTING_REASONS,
  STANDING_REASONS,
  WAITING_REASONS,
  isWaitingReason,
  reasonOutcome,
  type CapacityReason,
  type ReasonOutcome,
  type RejectingReason,
  type StandingReason,
  type WaitingReason,
} from './domain/capacity-reasons.js';
export { isSupersessionDue, type SupersessionWorker } from './domain/supersession.js';
export {
  chargedRuns,
  decideDelegation,
  type DelegationDecision,
  type DelegationSnapshot,
  type RunCapacity,
  type TaskLineageLink,
  type WaitingParentUnits,
} from './domain/delegation-admission.js';
export { fairPlacementOrder, type WaitingPlacement } from './domain/fair-order.js';
export { placementBackoff } from './domain/placement-backoff.js';
export {
  decidePlacement,
  type AttemptStanding,
  type ChargeStanding,
  type CredentialStanding,
  type PlacementDecision,
  type PlacementSnapshot,
  type QuotaStanding,
  type WorkerStanding,
} from './domain/placement-decision.js';
export type { CapacityCharge, CapacityLedger, OpenDelegation, WorkerOccupancy } from './ports/capacity-ledger.js';
export type { CapacityStore, CapacityTransaction } from './ports/capacity-store.js';
export type { InstallationGuard } from './ports/installation-guard.js';
export { isEligibleForPlacement, type PlacementWorkers, type WorkerPlacementRecord } from './ports/placement-workers.js';
export type { QuotaSettings } from './ports/quota-settings.js';
export type { TaskLineage } from './ports/task-lineage.js';

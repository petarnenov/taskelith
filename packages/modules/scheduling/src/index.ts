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
export { InMemoryDelegationRequests, InMemoryPlacementQueue, InMemoryPlacementRotation } from './adapters/in-memory-placement.js';
export { InMemoryWorkerReports } from './adapters/in-memory-worker-reports.js';
export { InMemoryOutboxLookup } from './adapters/in-memory-outbox-lookup.js';
export {
  CANDIDATE_WORKER_FIXTURES,
  CAPACITY_LEDGER_CONFORMANCE,
  CHILD_LINK,
  PLACEMENT_CANDIDATES_CONFORMANCE,
  PLACEMENT_QUEUE_CONFORMANCE,
  PLACEMENT_ROTATION_CONFORMANCE,
  PLACEMENT_WORKERS_CONFORMANCE,
  PLACEMENT_WORKER_FIXTURES,
  QUOTA_FIXTURES,
  QUOTA_SETTINGS_CONFORMANCE,
  REPORTING_WORKER_FIXTURE,
  ROOT_LINK,
  TASK_LINEAGE_CONFORMANCE,
  WORKER_REPORTS_CONFORMANCE,
  type CapacityLedgerConformanceTarget,
  type PlacementCandidatesConformanceTarget,
  type PlacementQueueConformanceTarget,
  type WorkerReportsConformanceTarget,
} from './ports/capacity-conformance.js';
export type { AssignmentRepository } from './ports/assignment-repository.js';
export type { Outbox, OutboxLookup, OutboxMessage } from './ports/outbox.js';
// The outbox ports are structurally identical, so they share one suite.
export { OUTBOX_CONFORMANCE } from '@taskelith/sdlc';
export {
  ASSIGNMENT_REPOSITORY_CONFORMANCE,
  DELEGATION_REQUESTS_CONFORMANCE,
  OUTBOX_LOOKUP_CONFORMANCE,
  type OutboxLookupConformanceTarget,
} from './ports/repository-conformance.js';
export { admitDelegation, type DelegationRequest } from './application/delegation-admission.js';
export {
  cancelExecutionInTransaction,
  cancelInTransaction,
  placeInTransaction,
  refuseInTransaction,
  releaseInTransaction,
  supersedeInTransaction,
  supersedeUngrantedInTransaction,
  type PlacementOutcome,
  type PlacementRequest,
  type ReleaseOutcome,
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
  DEFAULT_ATTEMPT_REQUEST,
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
  FLEET_REASONS,
  NO_CANDIDATE_REASON,
  REJECTING_REASONS,
  STANDING_REASONS,
  WAITING_REASONS,
  WORKER_REASONS,
  isWaitingReason,
  lacksFleetCapacity,
  reasonOutcome,
  triesNextCandidate,
  type CapacityReason,
  type ReasonOutcome,
  type RejectingReason,
  type StandingReason,
  type WaitingReason,
} from './domain/capacity-reasons.js';
export { automaticRetryOf } from './domain/automatic-retry.js';
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
export {
  DELEGATION_STATES,
  isAwaitingCapacity,
  isSameDelegation,
  recordDelegation,
  redecideDelegation,
  type DelegationId,
  type DelegationInput,
  type DelegationOutcome,
  type DelegationRecord,
  type DelegationState,
  type DelegationValues,
} from './domain/delegation-request.js';
export { RotationCursor, fairPlacementOrder, fairWaitingOrder, type WaitingPlacement } from './domain/fair-order.js';
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
export type { DelegationRequests } from './ports/delegation-requests.js';
export type { InstallationGuard } from './ports/installation-guard.js';
export type { PlacementQueue } from './ports/placement-queue.js';
export type { PlacementRotation } from './ports/placement-rotation.js';
export { isEligibleForPlacement, type PlacementWorkers, type WorkerPlacementRecord } from './ports/placement-workers.js';
export type { QuotaSettings } from './ports/quota-settings.js';
export type { TaskLineage } from './ports/task-lineage.js';
export type { CapacityDeclaration, WorkerReports } from './ports/worker-reports.js';
export {
  COOLDOWN_SOURCES,
  FIRST_SLOT_REVISION,
  SLOT_COOLDOWN_DEFAULT_MINUTES,
  SLOT_HEALTH,
  SLOT_INELIGIBILITY_REASONS,
  SLOT_STATES,
  parseAccountSlot,
  type AccountSlot,
  type CooldownSource,
  type SlotCooldown,
  type SlotCredentialVersion,
  type SlotHealth,
  type SlotIneligibilityReason,
  type SlotState,
  type SlotUsage,
  type SubscriptionMechanismId,
} from './domain/account-slot.js';
export {
  NO_SLOT_POLICIES,
  SLOT_REJECTING_REASONS,
  SLOT_REQUEST_KINDS,
  SLOT_WAITING_REASON,
  parseSlotRequest,
  type HarnessSlot,
  type NoSlotPolicy,
  type SlotRejectingReason,
  type SlotRequest,
  type SlotRequestKind,
  type SlotSelection,
} from './domain/slot-selection.js';
export { SlotSecret } from './domain/slot-secret.js';
export type { AccountSlots, SlotCredentials } from './ports/account-pool.js';
export { ACCOUNT_SLOTS_CONFORMANCE, SLOT_CREDENTIALS_CONFORMANCE } from './ports/account-pool-conformance.js';

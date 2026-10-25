import type { ResourceRequest } from './capacity-reservation.js';

// The provisional defaults of docs/operational-targets.md section 1 that the
// scheduler enforces; quotas are installation settings with these defaults.
export const DEFAULT_PROJECT_QUOTA = 4;
export const DEFAULT_RUN_QUOTA = 2;
export const MAX_ATTEMPT_CPU_MILLICORES = 2_000;
export const MAX_ATTEMPT_MEMORY_MEBIBYTES = 4_096;
export const MAX_DELEGATION_DEPTH = 3;
export const MAX_TREE_ATTEMPTS = 8;
export const MAX_AUTOMATIC_RETRIES = 2;
export const DEFAULT_PROVIDER_CREDENTIAL_CONCURRENCY = 4;

// Author's provisional values that item 18 fixes (operational targets): how
// long a delegation may wait for a free unit before it is rejected.
export const DELEGATION_CAPACITY_WAIT_BOUND_MILLISECONDS = 10 * 60_000;

// Supersession bounds for an assignment that never received a grant; an
// unreachable, draining, or revoked worker has no bound.
export const UNACKNOWLEDGED_SUPERSESSION_BOUND_MILLISECONDS = 2 * 60_000;
export const ADMISSION_PRESSURE_SUPERSESSION_BOUND_MILLISECONDS = 10 * 60_000;

// A placement that fails for a transient reason is tried this often in all.
export const PLACEMENT_RETRY_ATTEMPTS = 5;

// Backoff for placement retries and capacity waits (contract section 5).
export const PLACEMENT_BACKOFF_INITIAL_MILLISECONDS = 5_000;
export const PLACEMENT_BACKOFF_MAX_MILLISECONDS = 60_000;

// What placement reserves for an attempt: there are no provider credentials
// in G2, so no hard control is required (contract section 2).
export const DEFAULT_ATTEMPT_REQUEST: ResourceRequest = Object.freeze({
  cpuMillicores: 1_000,
  memoryMebibytes: 2_048,
  hardControls: Object.freeze([]),
});

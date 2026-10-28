## 1. Contract and specs

- [x] 1.1 `docs/contracts/worker-admission.md`: the port, the report, the states, the stored outcomes, placement, and the view
- [x] 1.2 `docs/contracts/execution-wire-contracts.md` section 5: `worker.self-check.reported` and the refusal reason
- [x] 1.3 `docs/contracts/capacity-reservation.md` section 11: `worker-not-eligible` names a worker that is not admitted; `worker-self-check-failed` row
- [x] 1.4 `docs/contracts/product-ports.md` section 8 and `docs/contracts/installation-and-enrollment.md` section 5: point at the new contract
- [x] 1.5 `execution.asyncapi.json`: the observation, the refusal reason, `info.version` 0.7.0; regenerated types; breaking-change check
- [x] 1.6 Spec deltas: `installation-enrollment`, `worker-runtime`, `product-ports`, `resource-admission`
- [x] 1.7 Owner answers to the design's open questions recorded
- [x] 1.8 `docs/contracts/supervisor-identity.md` section 8: a Linux worker that can spawn executions

## 2. Fleet and Scheduling

- [x] 2.1 `WorkerAdmissionCheck`, its scope, the not-applicable rule, and the worker admission decision in `@taskelith/fleet`; `SelfCheckResult` in `@taskelith/execution`
- [x] 2.2 `WorkerPlacementRecord.admitted`, `isEligibleForPlacement`, and `isSupersessionDue`
- [x] 2.3 The fenced report write and its conformance cases
- [x] 2.4 `WorkerAdmissionView` with in-memory adapter and conformance suite

## 3. Persistence and control plane

- [x] 3.1 Migration: `workers.worker_admission`, the self-check fence and report time, `worker_self_check_results`
- [x] 3.2 PostgreSQL adapters: `ELIGIBLE`, the report write, the journal incarnation reset, the view
- [x] 3.3 Observation effect for `worker.self-check.reported` and the refusal reason

## 4. Worker

- [x] 4.1 `self-check-reported` journal fact and its observation identity and message
- [x] 4.2 The start step that runs the composed checks and journals the report
- [x] 4.3 The `linux-containment` adapter over `checkLinuxContainment`, composed in `main.ts`
- [x] 4.4 Offer refusal and no launch authorization while the self-check failed

## 5. Tests and records

- [x] 5.1 Fail-before tests of design D10; coverage at least 75% of lines, branches, and functions
- [x] 5.2 `npm run openspec -- validate implement-worker-self-check-admission --strict`
- [x] 5.3 `make verify`
- [x] 5.4 `verification.md`
- [x] 5.5 Independent review passes, recorded in `passes.jsonl` and `findings.jsonl`
- [x] 5.6 `make verify-installation` and `make verify-linux-cgroup` with Docker, run by the developing worker (Desi) before the handoff
- [x] 5.7 Archive, handoff, and integration by the coordinator

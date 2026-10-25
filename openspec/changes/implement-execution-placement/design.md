## Context

Item 16 left the placement loop and the control-plane side of `requestDelegation` to item 21 (its coordinator decisions Q1 and Q7). Item 18 provides the reservation transaction (`placeInTransaction`) and the delegation checks (`admitDelegation`), but no loop calls them. The execution domain provides `openAttempt` and `claimOwnership`.

## Coordinator decisions (2026-10-25)

These are coordinator decisions for item 21, recorded in each of its changes.

- **Split (proposal A).** Item 21 becomes four changes in order: 21a `implement-execution-placement`, 21b `implement-observation-consumption`, 21c `implement-inventory-reconciliation`, and 21d `wire-launch-authority-reconciliation`. Each one is merged and archived before the next. Codex reviews each, with a cap of three passes per change.
- **Q1 (a): worker choice.** A candidates query over the eligible workers; the first candidate that the reservation accepts is taken.
- **Q2 (a): reachability.** Any authenticated observation or inventory report counts as first contact. Detecting lost contact by timeout stays with items 20 and 24.
- **Q3 (a): release outcome.** `Result<{ outcome: 'released' | 'kept', assignment }>`, with every caller and test updated in the same change (21b).
- **Q4 (a): persistence.** Each table belongs to its module, behind that module's own ports, and `make check-boundaries` stays green. `delegation_requests` comes in 21a, `producer_cursors` in 21b, and `inventory_requests` in 21c.
- **Q5 (a): revoked worker.** Goes to 21d.
- **Q6 (a): tests before item 17.** Seeded `authorizedUnder` grants, which 21d replaces with the real wiring.
- **Sequence gaps.** The domain is followed: observations past a gap are applied, and only the confirmation is held (execution-model "Producer sequence of observations").

## Goals / Non-Goals

**Goals:** the placement loop over waiting tasks, the candidate query, and `requestDelegation` with its persisted state.

**Non-Goals:**
- first contact as reachability, observations, acceptance and refusal, outcomes, releases, and retries (21b);
- the inventory (21c);
- launch authorization and revocation (21d);
- lost-contact timeouts (items 20 and 24).

## Decisions

1. **What waits.** `placementNeed(task)` in the execution domain returns `open-attempt` for a task without attempts, `place` with the attempt for an active attempt that is not cancelled and owns no execution that can still run, and nothing otherwise. A task whose attempts have all ended does not wait: an automatic retry is 21b's.
2. **Query columns.** The task repository writes `awaits_placement`, `active_attempt_id`, and `placement_waiting_since` (the task's `changedAt` while it waits) from `placementNeed`. The migration backfills them from the stored records, as the observability migration did. `PlacementQueue.waiting(limit)` reads the waiting tasks whose active attempt holds no reservation, with the project from `task_lineage`, in a READ COMMITTED read. It selects the batch fairly before the limit: each task is ranked within its project by `placement_waiting_since` (`row_number()` partitioned by project), and the batch is ordered by that rank, then the waiting time, the project, and the task. One project's older tasks thus cannot fill the batch and hide another project's task. The in-memory adapter ranks the same way. The service orders the batch with `fairPlacementOrder`.
3. **One transaction per task, all or nothing.** The transaction reloads the task and checks `placementNeed` again.
   - For `open-attempt`, it opens the first attempt.
   - For `place`, it claims the ownership when an assignment of the attempt already exists at the current ownership generation. Each placement thus carries its own generation.
   - It then calls `placeInTransaction` on each candidate. When no candidate places the attempt, the work returns an error, so the transaction rolls back and the task waits unchanged. This avoids raising the ownership generation on every pass.
4. **Identities.** The attempt, assignment, reservation, and command identities are derived from the task, the attempt number, and the ownership generation, by SHA-256 with a one-letter prefix, as `admissionIdOf` does. A serialization retry of the same transaction reuses them.
5. **Candidates.** `PlacementWorkers.candidates()` returns the eligible workers, fewest held reservations first, then by `workerId`.
   - `worker-not-eligible`, `worker-capacity-exhausted`, and `control-not-enforceable` move to the next candidate.
   - Any other reason ends the try.
   - Each task's transaction reads the candidates itself, so that a placement, and a serialization rerun of it, sees the reservations held before it.
   - A cheap read before the tasks checks that any candidate exists; when none does, no transaction is opened.
   - A rejecting reason leaves the task waiting. Ending the attempt on it needs the outcome facts of 21b.
6. **Default request.** `DEFAULT_ATTEMPT_REQUEST` is 1000 millicores, 2048 MiB, and no hard controls. There are no provider credentials in G2 (capacity reservation section 2).
7. **Delegation.**
   - **Authority.** The parent is the task of the attempt for which the authenticated worker holds a reservation. The service reads it through `AssignmentRepository.listByAttempt`; without such a reservation, the answer is `forbidden` (403).
   - **Order.** The child's run must exist and belong to the root's project. The child is admitted by SDLC admission like a submitted task, with its admission identity derived from the run and the child, and then by `admitDelegation`, starting from the stored start of the wait or from the database time.
   - **Admitted.** The service creates the child's admission and task and appends `sdlc.admission.used`, sharing these steps with `TaskService`; `admitDelegation` writes the lineage link.
   - **Record.** `DelegationRequests` stores the request's values, the worker, the state, the outcome, and `waitingSince`, with a generation for compare-and-set.
   - **Taken child.** For a new `delegationId`, a child task identity already taken by a task or a lineage link is `conflict` (409). The check runs in the same transaction, before SDLC admission and the capacity decision, so that no waiting or rejected outcome hides it.
   - **Repeat.** A repeat with other values is `conflict` (409). A repeat of an admitted or rejected delegation returns the stored outcome.
8. **Routes.** `requestDelegation` uses the worker credential, answers 200 with `DelegationOutcome`, and maps `forbidden` to 403 and the reason `worker-not-authorized` to 401, as `publishEvidence` does. It maps `conflict` to 409, and `precondition-failed` and `not-found` to 422. A store that is down is 503, and an internal failure 500, as on every route; `execution.openapi.json` 0.3.1 declares both for `requestDelegation`, a compatible addition.
9. **Loop.** The composition root runs one placement pass every 5 seconds, a provisional value recorded in the operational targets. A pass handles at most 100 waiting tasks.
10. **Backoff.** `PlacementService` applies the backoff of capacity reservation section 5 (exponential from 5 s to 60 s with jitter, through `placementBackoff`) in memory, because the per-task transaction rolls back and has nowhere durable to keep it.
    - **Per task.** It counts each task's consecutive tries that placed nothing and leaves the task out of the waiting read until its next try: `PlacementQueue.waiting(limit, excluding)` drops the excluded tasks before the fair ranking and the limit. A pass whose whole batch backs off thus reaches the tasks after it, and a project beyond the first 100 is not hidden by blocked ones.
    - **Forgetting.** It forgets a task when it is placed, or when its next try lies more than the longest delay (60 s) in the past without a new failure, which bounds the state. A task that keeps failing is tried as soon as it is due, so it fails again within that window and keeps its exponent. A task's absence from a read does not forget it, because the tasks that back off are absent by design.
    - **Per pass.** After a pass ends in an outage (`unavailable` or `internal`), the next passes back off the same way; a successful pass resets them.
    - **Timing.** The clock and the jitter draw are injected, as `RetryTiming` injects the draw; the composition root wires `Date.now` and `Math.random`.
    - **Restart.** A restart forgets the backoff, so each waiting task is tried at the next pass. That is acceptable for the single control-plane instance of G2.

## Risks / Trade-offs

- **No reachable worker yet.** First contact comes in 21b. Until then, only tests that seed reachable workers place anything.
- **One control-plane instance.** As for item 16's loops: the SERIALIZABLE transaction and the held-reservation index keep several instances correct, but they would each run the loop.
- **A task rejected for capacity keeps waiting.** It is tried again after its backoff until 21b ends the attempt on a rejecting reason.

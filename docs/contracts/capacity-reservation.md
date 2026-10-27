# Capacity reservation contract

Date: 2026-10-25. Status: proposed protocol contract for G2 ([G2 work plan](../g2-plan.md) item 6), under independent review; once reviewed and merged it resolves the pre-G2 contract "capacity reservations" of [architecture section 15](../architecture.md#15-decisions-still-requiring-evidence-or-owner-scope-confirmation). It serves F22 and R32. G2 item 7 (execution domain model) modeled its records and item 18 (resource admission) implements the scheduler side (section 13); item 20 (worker agent runtime) builds the worker side, and item 24 runs its failure scenarios.

## 1. Purpose and parties

An attempt runs only while it holds capacity that was reserved for it in PostgreSQL before its assignment existed ([architecture section 8, "Resource admission and delegation"](../architecture.md#resource-admission-and-delegation), and section 9, normal flow step 2). A **capacity reservation** is the durable record of that capacity: which worker slot, which requested resources, and which project, run, delegation, and provider budgets one attempt occupies or consumes.

- **Scheduler:** the control-plane `Scheduling` module (architecture section 6). It may run as several replicas; they share no in-memory capacity counters, and every placement decision is re-checked inside the reservation transaction (section 4).
- **Launch authority:** the control-plane service of the [launch authorization contract](launch-authorization.md). It compares the reservation the assignment holds when it authorizes a launch.
- **Execution reconciliation:** the control-plane service that records lifecycle facts from worker observations and operator decisions (G2 item 21). A reservation is released only by a transition of section 6.
- **Worker:** the enrolled worker service ([trust model](../trust-model.md)). It enforces its own hard admission limits independently of the scheduler (section 8) and journals its decisions under the worker journal contract (G2 item 5, `define-worker-journal-contract`).

## 2. Resources and budgets

A reservation draws on two kinds of budget:

- **Occupancy** is held while the reservation is `held` and returned when it is released: a worker slot, CPU and memory on that worker, a unit of the project and run concurrency quotas, and a unit of each provider credential's concurrency.
- **Consumption** is charged once per attempt, by the attempt's first reservation, and never returned: one attempt of the root task's delegation budget and, for an automatic retry, one unit of the task's retry allowance. The charge is a record unique per `attemptId`, so a later reservation of the same attempt, after a refusal or a supersession without a grant, charges nothing.

The values are the provisional defaults of the [operational targets](../operational-targets.md) section 1. An installation may change a configurable value within the targets' hard ceilings; the contract fixes the rules, not the numbers.

| Budget | Kind | Scope | Default (operational targets) | Exhausted |
| --- | --- | --- | --- | --- |
| Worker slots | Occupancy | Worker | `2` concurrent active attempts, configurable, never above the host's CPU and memory sizing | Wait for another worker or a release |
| CPU and memory | Occupancy | Worker | Per attempt `1 vCPU` and `2 GiB` by default, at most `2 vCPU` and `4 GiB`; a worker's capacity is its host sizing (reference host `4 vCPU`, `8 GiB`) minus the daemon ceiling (`0.5 vCPU`, `512 MiB`) | Wait; a request above the per-attempt ceiling is rejected |
| Project concurrency | Occupancy | Project | `4` concurrent attempts | Wait |
| Run concurrency | Occupancy | Workflow run | `2` concurrent attempts | Wait |
| Provider credential concurrency | Occupancy | Provider credential, including each subscription account slot | `4` concurrent active requests or turns per credential | Wait |
| Delegation depth | Structural | Task tree | `3` levels below the root task | Reject |
| Delegation attempts | Consumption | Root task | `8` attempts in the whole task tree | Reject |
| Automatic retries | Consumption | Task | `2` for a proven-idempotent or safe failure, `0` for uncertain execution | Reject; backoff `5s` initial, `60s` maximum, with jitter |

The memory of an execution's per-execution supervisor (decision D7 (c), item 4) counts toward that execution's reservation, not toward the daemon ceiling.

Worker-side limits that are not reserved centrally, but enforced by the worker, are in section 8: the disk floor, the journal backlog, and the daemon overhead ceiling.

Provider credential concurrency is reserved at attempt granularity: an attempt that uses a credential holds one of its units for its whole life, so a credential admits at most its limit of concurrent attempts. Turn-level concurrency inside one attempt belongs to the harness plugin (G3). In G2 the executed program is a test-only scripted process (item 15) that uses no provider credential, so no reservation holds a credential unit yet; section 10 names the G3 extension.

Token and cost usage is accounted, not reserved. Reconciliation records reported usage as `estimated` or `confirmed` by the provider, and the contract promises no hard spend limit without provider enforcement (section 9).

## 3. The reservation record

A reservation is created with its assignment and is immutable apart from its state:

| Field | Meaning |
| --- | --- |
| `reservationId` | Stable identity, unique in the installation |
| `assignmentId`, `attemptId`, `ownershipGeneration` | The assignment that holds it, its attempt, and the generation the assignment was created at |
| `workerId` | The worker whose slot it occupies |
| `projectId`, `runId`, `taskId`, `rootTaskId` | The quota and budget scopes it charges (section 7 defines `rootTaskId`) |
| `requested` | The requested CPU and memory, and the hard controls the attempt requires (section 9) |
| `providerCredentials` | The provider credential units it holds; empty in G2 |
| `retry` | Whether it is an automatic retry, and of which earlier attempt |
| `state` | `held` or `released`; `released` is terminal |
| `createdAt`, `releasedAt` | Database clock |
| `releasedBy` | The lifecycle fact that justified the release (section 6) |

An attempt has at most one `held` reservation, enforced by a uniqueness constraint over held reservations per attempt, and an assignment has exactly one reservation for its whole life. A reservation is never re-held, moved to another worker, or resized: a different placement or size is a new assignment with a new reservation, after the old one is released.

"Held for this attempt on this worker", as the launch authority compares it, means: the assignment's reservation is in state `held`, its `attemptId` is the authorized attempt, and its `workerId` is the authenticated worker. Any other result rejects the launch with `capacity-not-reserved`.

## 4. The reservation transaction

Reserving capacity and creating the assignment are one PostgreSQL transaction at `SERIALIZABLE` isolation, the isolation of the launch authorization contract. In that transaction the scheduler:

1. Reads the installation record and creates nothing in restore quarantine.
2. Reads the attempt and checks that it is admitted, not cancelled or terminal, and holds no `held` reservation.
3. Reads the target worker and checks that it is enrolled, unrevoked, not draining, reachable, reports no admission pressure (section 8), and declares every hard control the attempt requires (section 9).
4. Reads every budget of section 2 that the attempt charges, computing each occupancy from the `held` reservations and each consumption from the charged records, and checks that the reservation fits all of them, including the delegation rules of section 7 and the retry rules of section 5.
5. Inserts the reservation in state `held`, the assignment, and the assignment command in the outbox, all three or none.

Occupancy is derived from the reservation rows, or from counter rows that the same transaction updates; a replica never trusts a count it read outside the transaction. A placement chosen from a cached fleet snapshot is only a candidate.

Serializable ordering covers only transactions that are themselves serializable, so every writer of a value this transaction reads also runs at `SERIALIZABLE`: a quota or worker capacity change, a capacity declaration, drain, admission pressure and its clearing, a reachability change, worker revocation, the attempt's admission, cancellation, or terminal state, an assignment's end, a release, a task's parent link, and entering quarantine.

The first failed check decides the outcome with a reason from section 11: a waiting reason leaves the task queued for a later attempt at placement, and a rejecting reason ends its admission to capacity. A serialization failure aborts the whole transaction; the scheduler retries it with the same command identity and recomputes the placement from current state, so a retry may choose another worker or wait.

### Races between scheduler replicas

PostgreSQL commits only serializable histories ([PostgreSQL 18, Serializable isolation](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-SERIALIZABLE)), so concurrent reservation transactions behave as if run one after another:

- Two replicas placing the same attempt: at most one commits; the other fails on serialization or on the held-reservation uniqueness constraint, and creates nothing.
- Two replicas placing different attempts on the last free slot, or into the last unit of a project, run, credential, or delegation budget: at most one commits; the other retries and waits or rejects.
- A reservation racing a release, a quota or capacity change, a worker revocation or drain, a cancellation, or entering quarantine: it is ordered before or after it, and never commits against a state that no serial order allows.

## 5. Waiting, fairness, and retries

- **Fair admission.** When capacity is scarce, the scheduler offers it to waiting tasks fairly across projects, so that one project, retry loop, or approval-blocked session cannot hold the whole fleet. The project and run quotas bound each project and run; within them, item 18 fixes the order (the default is a rotation across projects that starts after the rotation cursor that item 18 fixes, oldest waiting task first within each). An attempt waiting for a native approval keeps its reservation and counts against its quotas.
- **Bounded backoff.** A task that no candidate accepts for a reason other than a lack of fleet capacity, such as its project's or run's quota, and a scheduler retrying after a transient failure, back off exponentially from `5s` to at most `60s`, with jitter. A task declined for lack of fleet capacity (section 13, "Fair order") does not back off: its wait stays unchanged, so it keeps its place in the rotation, and the next pass that reads it offers it in rotation order; a freed slot follows the rotation, not the end of a backoff. A pass offers at most the placement batch of waiting tasks (operational targets section 1) and ends at its first decline for lack of fleet capacity, so a full fleet costs one such declined placement transaction per pass, and capacity that becomes available during a pass is deferred to the next pass, which offers it in rotation order, not to a later task of the same pass. While all requests are equal, a task after that decline would find no room either, as long as the candidate workers, their eligibility, quarantine, and capacity do not change during the pass.
- **Automatic retries.** A new attempt after a failure is automatic only when the earlier attempt's failure is proven idempotent or safe and its reservation is released (section 6); the task may have at most `2` automatic retries. An attempt whose execution is uncertain has `0`: it is reconciled, never retried blindly. A retry is a new attempt with a new reservation that charges the retry allowance and the delegation budget. A retry that an operator starts explicitly is not automatic, but still charges the delegation budget.

## 6. Release only with a justified lifecycle transition

A reservation is released only when both of these hold, in the transaction that records the later of them, which becomes its `releasedBy`:

1. **The assignment has ended:** its attempt reached a terminal outcome (item 7), the worker refused the assignment (section 8), or it was cancelled or superseded. Superseding an acknowledged assignment is an ownership change of the [launch authorization contract](launch-authorization.md) section 5.
2. **No execution under it is non-terminal:** every execution authorized under the assignment is `exited`, or `not-started` recorded after the worker sealed its launch record (launch authorization section 4), or no launch authorization was ever granted for it.

The only other justifying fact is an **operator reconciliation**: an operator with the authority of the [trust model](../trust-model.md) resolves an uncertain execution with a recorded, audited decision and its evidence. The same transaction records the execution's outcome and ends the assignment, so an attempt never has an active assignment with a released reservation.

**Cancellation.** The transaction that records the cancellation of an assignment reads the assignment's grants and executions at `SERIALIZABLE`. When no execution under it is non-terminal, it ends the assignment, releases, and writes an assignment-ended command to the worker's outbox. When one is `authorized` or `started`, it releases nothing: the end is a cancellation of that execution, and the transaction that records its terminal fact releases.

**Bounded supersession.** The scheduler may supersede an assignment for which no launch authorization was ever granted when its worker has not acknowledged it within a bound, is unreachable, draining, or revoked, or has held it under admission pressure beyond a bound; item 18 fixes the bounds. The supersession reads the assignment's grants at `SERIALIZABLE`: with none it ends the assignment, releases, and writes an assignment-ended command to the worker's outbox, and a later authorization is rejected because the assignment is no longer active; with one it releases nothing, and the rules below apply.

`not-started` alone ends nothing: while the assignment is active, the worker may authorize a new execution under it (launch authorization sections 4 and 7) against the same held reservation. An assignment that ends while an execution is still `authorized` or `started` keeps its reservation; the end is a cancellation, and the reservation is released by the transaction that records that execution's terminal fact.

Nothing else releases a reservation, and in particular not:

- loss of contact, reachability `unknown`, or a missed heartbeat;
- a revoked or decommissioned worker, whose attempts become uncertain ([trust model](../trust-model.md) section 4) and keep their reservations until reconciled;
- the expiry or revocation of a launch authorization;
- a cancellation request while an execution under the assignment is non-terminal;
- a worker restart, a control-plane restart, a scheduler failover, or a lowered quota or capacity;
- the end of the parent task of a delegated child, or a new session identity of the same work.

A lost-contact attempt therefore keeps its worker slot, resources, quotas, and credential units until ownership is resolved: uncertainty is not free capacity. The scheduler places no new work on an unreachable worker, so the held slot is not reused there either. The fleet capacity signal of item 22 reports held capacity of uncertain attempts separately from running and free capacity, as F22 requires.

A release is an **invalidating writer** of the launch authorization contract (section 5 there). It runs at `SERIALIZABLE` isolation and, in the same transaction, reads unconditionally the affected grants and non-terminal owning executions by assignment, marks each such grant `revoked` with the reason `capacity-not-reserved`, and writes a cancellation command to the outbox for each affected attempt. Under conditions 1 and 2 that read is empty; it finds an execution only in an operator reconciliation that resolves an execution as gone without a recorded terminal fact. An authorization serialized before the transaction that ends the assignment makes condition 2 false, so that transaction releases nothing; one serialized after it is rejected because the assignment is no longer active, and any authorization after a release fails with `capacity-not-reserved`.

Releasing returns occupancy and never returns consumption: the delegation and retry budgets stay charged.

## 7. Delegated child budgets

A delegated child task is created through SDLC admission like any other task (invariant 10) and is bound to its parent when it is created:

- **Parent and root.** The control plane derives the parent from the delegating attempt, never from a request field: the delegation request is authenticated as the worker principal and names an attempt that this worker currently owns at the current ownership generation, which the control plane verifies (the wire form is item 8's, the harness side G3's). The child records `parentTaskId`, `rootTaskId` (the parent's root, or the parent itself when the parent is a root), and `depth` (the parent's depth plus one; a root has depth `0`). A child belongs to its root's project.
- **Depth.** A child of depth greater than `3` is rejected with `delegation-depth-exceeded` when it is created.
- **Runnable chains.** A delegating attempt that waits for its child keeps its reservation, so a chain from the root to a child of depth `d` holds `d + 1` units of the project quota and, in each run quota the child charges, one unit per chain member that charges it. A child for which, in any quota it charges, these units exceed the quota could never run while its ancestors wait, and is rejected at creation with `delegation-chain-exceeds-quota`. With the default quotas (`4` per project, `2` per run) and children in the root's run, the effective depth is therefore `1`; reaching depth `3` there needs a run quota of at least `4`.
- **Shared attempts.** Every attempt of every task in the tree, the root's own attempts and all retries included, charges one attempt of the root's budget, once, in its first reservation transaction (section 2); a reservation that would make the total exceed `8` is rejected with `delegation-budget-exhausted`.
- **Progress across trees.** A **waiting parent** is an attempt with an admitted delegation whose child has not reached a terminal outcome. A delegation is admitted, in a `SERIALIZABLE` transaction, only if afterwards the waiting parents hold fewer units than the capacity of every quota the child charges (project, the child's run, the root's run) and fewer worker slots than the fleet's eligible slots, so that at least one unit in each stays free of waiting parents. Otherwise the delegation waits with `delegation-awaiting-capacity`, for at most a bound that item 18 fixes, and is then rejected with that reason, so that a delegating attempt never waits without bound while it holds a unit.
- **Shared quotas.** A child's attempts charge the project quota, the quota of the run the child is bound to, and the quota of the root task's run, the latter once when both runs are the same.
- **No new budgets.** The budget is keyed by `rootTaskId` from the persisted parent link. A new session identity, a resumed or forked session, a new run, or a task created by a delegating agent without the parent link creates no independent budget: a task created from an attempt is always a child of that attempt's task.

The parent's reservation is not shared or split: each child attempt holds its own reservation, charged against the shared budgets above.

## 8. Worker-side hard admission limits

The worker enforces its limits itself, whatever the scheduler reserved, because its declared capacity can be stale and its local state is authoritative for what runs on it. It checks them when it validates an assignment before acknowledging it, and again before each launch authorization request:

| Limit | Value (operational targets) | Worker behavior |
| --- | --- | --- |
| Concurrent active attempts | Its configured slot count (`default: 2`) | Counts, once per attempt, every acknowledged assignment that has not ended and every non-terminal execution in its journal, uncertain ones included; refuses a new assignment beyond it with `worker-slots-exhausted` |
| Per-attempt CPU and memory | At most `2 vCPU` and `4 GiB` | Refuses a request above the ceiling with `resource-ceiling-exceeded`, and one whose CPU or memory, added to that of its counted attempts, exceeds its host capacity less the daemon ceiling with `worker-capacity-exhausted`; enforces the reserved values through the qualified controls of section 9 |
| Disk free-space floor | At least `5 GiB` or `10%` free on `dataRoot`, whichever is larger | Below it, requests no new launch authorization, reports admission pressure, and truncates only nonessential buffered stream logs, never journal, inbox, or outbox records |
| Journal backlog | At most `256 MiB` or `10,000` unacknowledged observation entries | Above it, admits no new attempt and reports admission pressure while existing attempts drain and reconcile |
| Daemon overhead | At most `512 MiB` RSS; event-loop lag `p99` at most `200ms` | Above it, requests no new launch authorization and reports admission pressure until it subsides |

- **Admission pressure** is an observation that makes the worker ineligible for new placement until a later observation clears it. An assignment the worker has not acknowledged is refused with the retryable reason `worker-admission-pressure`; an acknowledged one waits, keeping its reservation, and its launch is requested only when the pressure clears. The scheduler's bounded supersession of section 6 applies to it.
- **Refusal.** A refused assignment is reported as an observation. A refusal ends the assignment, and the release follows section 6. A refusal with `worker-slots-exhausted` or `worker-capacity-exhausted` makes the worker ineligible for new placement until its next capacity declaration or an observation that frees a slot: an exit, a `not-started`, or a launch rejection. Such an observation of the worker's own assignment clears the refusal even at a stale ownership generation, as evidence that changes no task, attempt, or assignment; one older than the refusal, by its journal sequence, or one that [launch authorization](launch-authorization.md) section 7 keeps as evidence, leaves it.
- **Ended assignments.** The worker ends an acknowledged assignment locally when it receives an assignment-ended command or a launch authorization rejection with `assignment-not-active`, and stops counting it.
- **Unknown values.** A limit the worker cannot measure, such as free disk space that cannot be read, counts as exceeded.
- **Declared capacity.** The worker declares its slot count, CPU and memory capacity, and enforceable controls at enrollment and whenever they change; a declaration is an observation. The scheduler uses the lower of the declared and the configured capacity. A lowered capacity blocks new reservations until held ones fit again, and releases nothing.

## 9. Fail-closed behavior for unenforceable controls

A task policy may require a control as **hard**: a CPU, memory, or disk limit, or a spend limit. A hard control is never silently weakened:

- **Declaration.** A worker declares a control as enforceable only when it is qualified for the worker's platform ([worker platforms](../worker-platforms.md)): for example cgroup v2 limits for the Linux worker container. A Linux control is not advertised as a macOS guarantee.
- **Scheduler.** It reserves capacity only on a worker that declares every hard control the attempt requires; when none does, the task waits with `control-not-enforceable`, which the operator sees.
- **Worker.** It re-checks the hard controls when it validates the assignment and before requesting launch authorization. A control it cannot apply is refused with `control-not-enforceable`, which is not retryable on that worker. The supervisor applies the controls before the child runs (item 4); if applying one fails, the child does not start.
- **Spend limits.** No G2 control enforces spend. A policy that requires a hard spend limit is rejected at reservation with `spend-limit-not-enforceable` until a provider plugin declares provider-side enforcement; reported usage is labeled `estimated` or `confirmed`.
- **Soft requests.** A requested CPU or memory value that the policy does not mark hard is still reserved and counted, and is recorded as `reserved, not enforced` on a worker that cannot enforce it.
- **Unavailable state.** When PostgreSQL is unreachable or in quarantine, no reservation is created; when the worker cannot read its journal or measure a limit, it admits nothing new.

## 10. Extension point: subscription account slots

[ADR 0005](../decisions/0005-harness-subscription-account-pools.md) makes a subscription account slot a provider credential of one harness, allowed for listed projects. This contract reserves it as a provider credential unit (section 2) and leaves its selection to G3:

- **Same transaction.** In G3 the harness-neutral account pool port selects the slot inside the reservation transaction of section 4, by ADR 0005's least-loaded rule over the eligible slots (allowed for the project, healthy, not in cooldown, below the concurrency limit), and the reservation records it in `providerCredentials`. No eligible slot is the waiting reason `provider-concurrency-exhausted`, or a rejection when the policy rejects.
- **Session affinity.** A reservation for a resumed session names the slot the session started on, and waits while that slot is unavailable, or the session is reconciled by policy or an operator (ADR 0005 decision 5); it never silently selects another slot. A slot that is revoked, removed, or no longer allows the project rejects the reservation with `session-slot-withdrawn` ([account pool contract](account-pool.md) section 4.3).
- **Sessions and attempts.** Counting attempts equals ADR 0005's count of active sessions only if a session has at most one active attempt; item 7's domain model must establish that, or G3 counts sessions explicitly.
- **Cooldown and revocation.** Cooldown makes a slot ineligible for new reservations and releases no held one. A revoked or removed slot follows section 6: its in-flight attempts are drained or reconciled, and their reservations are released only by a justifying fact.
- **Neutrality.** Reservation code, types, schemas, and tests name no harness or vendor (ADR 0005 decision 8).

G2 implements the `providerCredentials` field and the credential concurrency check with no credential in use; G3 adds the account pool port and its slots, which the [account pool contract](account-pool.md) defines.

## 11. Rejection and waiting reasons

The scheduler and the worker act on reasons, not text. Item 8 turns the worker's reasons into wire schemas.

| Check that failed | Reason | Raised by | Outcome |
| --- | --- | --- | --- |
| Installation in restore quarantine | `quarantined` | Scheduler | Wait until quarantine is lifted |
| Attempt already holds a reservation | `attempt-already-reserved` | Scheduler | None; the existing assignment stands |
| Attempt not admitted, cancelled, or terminal | `attempt-not-reservable` | Scheduler | None |
| Worker unknown, revoked, draining, unreachable, or under admission pressure | `worker-not-eligible` | Scheduler | Wait or place elsewhere |
| Worker slots, CPU, or memory full | `worker-capacity-exhausted` | Scheduler or worker | Wait or place elsewhere |
| Request above the per-attempt ceiling | `resource-ceiling-exceeded` | Scheduler or worker | Reject |
| Project quota full | `project-quota-exhausted` | Scheduler | Wait |
| Run quota full | `run-quota-exhausted` | Scheduler | Wait |
| Provider credential concurrency full | `provider-concurrency-exhausted` | Scheduler | Wait |
| Delegation depth above `3` | `delegation-depth-exceeded` | Task admission, at task creation | Reject |
| Waiting parents would hold every unit of a quota or the fleet's slots | `delegation-awaiting-capacity` | Task admission, at delegation | Wait up to the bound, then reject |
| Delegation chain larger than a quota it charges | `delegation-chain-exceeds-quota` | Task admission, at task creation | Reject; raise the quota or flatten the tree |
| Delegation attempts above `8` | `delegation-budget-exhausted` | Scheduler | Reject |
| Automatic retries above the allowance, or a retry of uncertain execution | `retry-budget-exhausted` | Scheduler | Reject; reconcile instead |
| No eligible worker declares a hard control | `control-not-enforceable` | Scheduler | Wait for a declaring worker |
| Hard control not applicable on the worker | `control-not-enforceable` | Worker | Release under section 6; place on another declaring worker |
| Hard spend limit without provider enforcement | `spend-limit-not-enforceable` | Scheduler | Reject |
| Worker's concurrent attempts full | `worker-slots-exhausted` | Worker | Release; place again |
| Disk floor, journal backlog, or daemon overhead exceeded | `worker-admission-pressure` | Worker | Release if not acknowledged; place again after the pressure clears |
| Offer in an execution protocol version the worker does not support | `protocol-not-supported` | Control plane, from the worker's command rejection | Release; place on a worker that supports a common version ([execution wire contracts](execution-wire-contracts.md)) |
| Reservation released or held elsewhere | `capacity-not-reserved` | Launch authority | As the launch authorization contract states |
| No eligible account slot for a new session whose project policy rejects (G3, item 12) | `no-eligible-slot` | Scheduler | Reject ([account pool contract](account-pool.md) section 4.5) |
| A resumed session's slot is revoked, removed, or no longer allows the project (G3, item 12) | `session-slot-withdrawn` | Scheduler | Reject; the session is drained or ended, never moved (account pool contract section 4.3) |

## 12. Required tests

Items 18, 20, and 24 implement these as tests through the deterministic test harness (item 10), as R32 requires:

- Two scheduler replicas race for the last worker slot, the last unit of a project, run, or credential quota, and the last delegation attempt: exactly one reservation commits, with either transaction as the serialization victim.
- Two replicas place the same attempt: one assignment and one held reservation exist.
- A reservation transaction that crashes before commit leaves no reservation, assignment, or outbox command; one that commits leaves all three.
- A disconnected, revoked, or crashed consuming worker keeps its reservations: the project quota stays occupied, no new work is placed on it, and the reservation is released only by a justifying fact or an audited operator reconciliation.
- Ending an assignment raced with launch authorization: either the authorization is rejected and the reservation is released, or the grant stands, the end becomes a cancellation, and the reservation stays held until the execution's terminal fact; an operator release of an uncertain execution revokes its grant and writes the cancellation.
- Grant, supervisor crash before spawn, seal, `not-started`: the reservation stays held and a new execution under the same assignment is authorized against it.
- A worker refuses an attempt and the attempt is placed again: the second reservation charges no delegation or retry budget.
- An assignment with no grant whose worker never acknowledges it, becomes unreachable, or waits under admission pressure beyond the bound is superseded, its reservation released, and a later authorization of it rejected; with a grant, supersession releases nothing.
- Expiry or revocation of a grant, a cancellation request, and a scheduler failover release nothing.
- A child of depth `4` is rejected; with the default run quota of `2`, a child of depth `2` in the root's run is rejected at creation with `delegation-chain-exceeds-quota`, and with run quotas of `4` it runs while its ancestors wait; the ninth attempt in a task tree is rejected, counting the root's attempts and retries; a new session identity or a resumed session draws on the same budget.
- A third automatic retry is rejected, and an attempt with uncertain execution gets no automatic retry; retries back off from `5s` to at most `60s`.
- A worker filled to its slot count, counting acknowledged assignments without executions, refuses another assignment even when the scheduler's view was stale; a full journal and a disk below the floor stop new admissions and launches, report pressure, and lose no control record.
- An attempt requiring a hard memory limit is placed only on a worker declaring it; a worker that cannot apply it refuses with `control-not-enforceable`; a hard spend limit is rejected.
- A lowered quota or worker capacity blocks new reservations and releases no held one.
- Four root attempts in a project with quota `4` each delegate a child: the fourth delegation waits with `delegation-awaiting-capacity` and is rejected after the bound, the three children run, and their parents finish; the same with two delegating roots in a run with quota `2`, and with waiting parents on every fleet slot.
- Cancelling an acknowledged assignment with no grant on a healthy, reachable worker ends it, releases its reservation, and sends the worker an assignment-ended command; cancelling one with a started execution releases only at that execution's terminal fact.
- One project's retry loop or approval-blocked attempts do not stop another project from receiving capacity.
- An exhausted provider credential limit makes the next attempt that needs it wait.

## 13. Values and writers fixed by G2 item 18

G2 item 18 (`implement-resource-admission`) implements the scheduler side in the `Scheduling` module and `@taskelith/postgres`, and fixes what this contract left to it, as provisional values recorded in the [operational targets](../operational-targets.md) section 1:

- **Fair order.** A rotation across projects (`fairPlacementOrder`): each round offers every waiting project's next task, its oldest not yet offered. Each round starts with the projects after the rotation cursor, then wraps around, in project id order. A pass ends at its first decline for lack of fleet capacity and makes no later offer (section 5); after a pass the cursor moves only by the offers made before that decline: it is the project of the last of them that placed its task, else of the last of them, else unchanged. The next read therefore offers the declined project's task before any task of a project after it in the rotation. An offer is a placement transaction that ended without a store outage, and a decline for lack of fleet capacity is one whose reason is `quarantined`, `worker-not-eligible`, `worker-capacity-exhausted`, or `no-candidate` (no candidate worker). A project that receives capacity therefore goes to the back of the rotation, a full fleet does not move the rotation past projects that waited for it (a fleet that stays full keeps the cursor, and the rotation resumes from it once capacity returns), and projects whose own limits decline their tasks (quotas, backoff, `control-not-enforceable`, a rejecting reason) cannot hold it. Within a project, equal waiting times are ordered by task id. Project and task ids compare in code-unit order, the order of PostgreSQL's `"C"` collation for ASCII identifiers. The read and the offer use this one order.
- **Durable cursor.** The installation keeps one rotation cursor, in the table `placement_rotation`, so a control-plane restart continues the rotation instead of starting it again; it resolves the in-memory cursor that [ADR 0015](../decisions/0015-g2-closure.md#5-deferrals) decision 5, "Fair-order rotation", left as a follow-up. Since a pass ends at its first decline for lack of fleet capacity, each placement moves the cursor, and it stores it in its own placement transaction, so a crash after the commit keeps the move. A move by declines for a reason of the task's own alone, which no placement stored, is stored once in a transaction of its own at the end of the pass, also after an outage stopped it; if that write fails, the move is lost. A pass whose offers do not move the cursor, such as one whose first offer meets a full fleet, writes nothing. Limitation: every control-plane instance reads and writes the same cursor, the last writer wins, and no instance coordinates its passes with another; G2 runs one control-plane instance ([architecture section 12](../architecture.md#12-scale-and-operations)).
- **Backoff.** A base doubling from `5s` to `60s`, each delay within `[5s, 60s]` with jitter, for the declines that section 5 backs off, not for a decline for lack of fleet capacity; a transiently failed placement is tried at most `5` times.
- **Delegation wait.** A delegation waits with `delegation-awaiting-capacity` for at most `10 min`, then is rejected with that reason.
- **Supersession.** An assignment without a grant is superseded after `2 min` unacknowledged, after `10 min` under admission pressure, and at once when its worker is unknown, unreachable, draining, or revoked.
- **Unknown installation.** An installation without its record admits nothing, as one in quarantine.
- **Standing reasons.** `attempt-already-reserved` and `attempt-not-reservable` are reported as standing: the placement changes nothing, and the task's admission to capacity is neither queued again nor ended by it.
- **Check order.** Step 4's request checks that no worker can satisfy, a hard spend limit and a size above the per-attempt ceiling, are made before the worker checks of step 3, so such a request is rejected instead of waiting for a worker.
- **Automatic retries.** A retry is automatic only after an earlier attempt of the task that ended `not-started`, or `exited` with a proven start and a known status (an exit code or a signal), and whose reservation is released; any other earlier attempt is uncertain and gets `retry-budget-exhausted`. That includes an `exited` one with an unknown status, which the [supervisor identity contract](supervisor-identity.md) section 6 keeps uncertain with a retry budget of `0`, and one whose spawn failed without a proven start, which is conservative. Whether an earlier attempt's side effects make a retry safe is not judged in G2; a later policy item decides it, and until then a proven exit with a known status counts as safe. The retry must name the earlier attempt that the active attempt retries.
- **Provider credentials.** Each credential a reservation holds is checked against the default concurrency of `4`; G2 reserves none.
- **Cancellation with a running execution.** The cancelling transaction revokes the owning execution's grants with `attempt-not-launchable` and writes its cancellation command (launch authorization section 5); the reservation is released by the transaction that records the terminal fact.

The reservation transaction reads tables that other items write, and each of those writers runs at `SERIALIZABLE` (section 4):

- `workers` (enrollment, revocation, drain, capacity declarations, controls, reachability, admission pressure) and `installation` (quarantine): created by item 18 with the columns placement reads; item 13 owns and extends them, and items 13, 20, and 21 write them.
- `capacity_quotas`: installation settings; a missing row is the operational targets' default.
- `task_lineage`: written once per task when it is created, by the item that creates tasks (a root link with depth `0`, or a child link through delegation admission).
- `delegations`: opened by delegation admission; the transaction that records a child's terminal outcome (item 21) closes it, which ends its parent's waiting.

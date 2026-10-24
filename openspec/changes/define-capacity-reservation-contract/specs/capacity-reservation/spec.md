## Purpose
Defines how the scheduler reserves worker slots, resources, quotas, and shared delegation budgets transactionally, when a reservation may be released, and how workers enforce hard admission limits and fail closed.

## ADDED Requirements

### Requirement: Transactional reservation
The scheduler SHALL create a capacity reservation, its assignment, and the assignment command in one serializable transaction that re-checks the worker, every quota and budget the attempt charges, and the attempt's eligibility against current state, never against an in-memory counter. Every writer of a value it reads SHALL also run serializably. An attempt SHALL hold at most one held reservation, and a reservation SHALL never be moved or resized.

#### Scenario: Replicas race for the last slot
- **WHEN** two scheduler replicas place different attempts on the last free slot of a worker
- **THEN** exactly one reservation commits and the other attempt waits or is placed elsewhere

#### Scenario: Replicas place the same attempt
- **WHEN** two scheduler replicas place the same attempt concurrently
- **THEN** one assignment and one held reservation exist

#### Scenario: Crash before commit
- **WHEN** the reservation transaction fails before commit
- **THEN** no reservation, assignment, or outbox command exists

### Requirement: Quotas and budgets
A reservation SHALL fit the worker's slots, CPU, and memory, the project and run concurrency quotas, and the concurrency of each provider credential it uses, with the operational targets' defaults (2 slots per worker, 4 attempts per project, 2 per run, 4 per credential, at most 2 vCPU and 4 GiB per attempt). Exhausted occupancy SHALL make the task wait; a request above a ceiling SHALL be rejected.

#### Scenario: Project quota full
- **WHEN** a project already has 4 held reservations and free workers exist
- **THEN** its next attempt waits with `project-quota-exhausted`

#### Scenario: Retry loop in another project
- **WHEN** one project's attempts retry repeatedly
- **THEN** another project's waiting task still receives capacity

### Requirement: Justified release
A reservation SHALL be released only when its assignment has ended and every execution under it is exited or sealed `not-started`, or none was granted, in the transaction recording the later fact, or by an audited operator reconciliation. Loss of contact, worker revocation, grant expiry or revocation, a cancellation request, a restart, or a lowered quota SHALL release nothing, nor SHALL a release refund delegation or retry budgets.

#### Scenario: Lost-contact worker
- **WHEN** a worker running an attempt loses contact or is revoked
- **THEN** the attempt keeps its reservation and quotas until a justifying fact or operator reconciliation releases it

#### Scenario: Cancellation requested
- **WHEN** a cancellation is requested for a started attempt
- **THEN** its reservation stays held until the exit or `not-started` fact is recorded

#### Scenario: Not started under an active assignment
- **WHEN** `not-started` is recorded for an execution while its assignment is still active
- **THEN** the reservation stays held and a new execution under the assignment can be authorized against it

### Requirement: Release ordered with launch authorization
A release SHALL run at serializable isolation as an invalidating writer: in the same transaction it SHALL read the affected grants and non-terminal executions by assignment, revoke those grants, and write cancellation commands. The launch authority SHALL reject with `capacity-not-reserved` unless the assignment's reservation is held for this attempt on this worker.

#### Scenario: Assignment end races authorization
- **WHEN** ending an assignment with no grant and its launch authorization run concurrently
- **THEN** either the authorization is rejected and the reservation released, or the grant stands and the reservation stays held until the execution's terminal fact

#### Scenario: Operator reconciliation
- **WHEN** an operator releases the reservation of an uncertain execution
- **THEN** the release revokes its grants and writes a cancellation command

#### Scenario: Worker never acknowledges
- **WHEN** an assignment has no grant and its worker does not acknowledge it within the bound or becomes unreachable
- **THEN** the scheduler may supersede it, releasing its reservation, and a later authorization of it is rejected

### Requirement: Shared delegation budget
A delegated child SHALL be bound at creation to its parent, derived from the authenticated delegating attempt, and to its root task. Depth SHALL be at most 3 below the root; every attempt in the tree, retries included, SHALL charge the root's budget of 8 attempts once, at its first reservation, while each held reservation occupies the project and run quotas. A child whose chain cannot fit those quotas SHALL be rejected at creation; no session identity or run SHALL create a new budget.

#### Scenario: Depth exceeded
- **WHEN** a task of depth 3 delegates a child
- **THEN** the child is rejected with `delegation-depth-exceeded`

#### Scenario: Chain larger than the run quota
- **WHEN** the run quota is 2 and a child of depth 2 in the root's run is requested
- **THEN** it is rejected with `delegation-chain-exceeds-quota`, because its waiting ancestors hold both units

#### Scenario: Ninth attempt
- **WHEN** a task tree has charged 8 attempts and any task in it needs another
- **THEN** the reservation is rejected with `delegation-budget-exhausted`

#### Scenario: New session identity
- **WHEN** delegated work resumes under a new session identity
- **THEN** its attempts charge the same root budget

#### Scenario: Attempt placed again
- **WHEN** a worker refuses an attempt and the attempt is placed again
- **THEN** the new reservation charges no delegation or retry budget

### Requirement: Bounded automatic retry
An automatic retry SHALL be a new attempt with a new reservation, allowed only after a proven-idempotent or safe failure whose reservation was released, at most 2 per task, with backoff from 5s to at most 60s with jitter. An attempt with uncertain execution SHALL get no automatic retry.

#### Scenario: Third automatic retry
- **WHEN** a task has used 2 automatic retries
- **THEN** another automatic retry is rejected with `retry-budget-exhausted`

#### Scenario: Uncertain execution
- **WHEN** an attempt's execution is uncertain
- **THEN** it is reconciled and not retried automatically

### Requirement: Worker-side hard admission limits
A worker SHALL enforce its own limits when it validates an assignment and before each launch authorization request: its slot count over its acknowledged active assignments and non-terminal executions, once per attempt, per-attempt ceilings, the disk floor (5 GiB or 10% free on `dataRoot`, whichever is larger), the journal backlog (256 MiB or 10,000 entries), and daemon overhead. A limit it cannot measure SHALL count as exceeded, and no control record SHALL be lost.

#### Scenario: Stale scheduler view
- **WHEN** a worker at its slot count receives another assignment
- **THEN** it refuses with `worker-slots-exhausted`

#### Scenario: Disk below the floor
- **WHEN** free space on `dataRoot` falls below the floor
- **THEN** the worker requests no new launch authorization, reports admission pressure, and truncates only nonessential stream logs

### Requirement: Fail-closed hard controls
A control a task policy marks hard SHALL be reserved only on a worker that declares it enforceable on its qualified platform; a worker or supervisor that cannot apply it SHALL refuse with `control-not-enforceable` and start nothing. A hard spend limit SHALL be rejected with `spend-limit-not-enforceable` until a provider enforces it, and usage SHALL be labeled estimated or confirmed.

#### Scenario: Unenforceable memory limit
- **WHEN** an attempt requires a hard memory limit and the worker cannot apply it
- **THEN** the worker refuses with `control-not-enforceable` and the child does not start

#### Scenario: Hard spend limit
- **WHEN** a policy requires a hard spend limit and no provider enforces one
- **THEN** the reservation is rejected with `spend-limit-not-enforceable`

### Requirement: Subscription account slot extension
A subscription account slot SHALL be reserved as a provider credential unit in the same reservation transaction, selected in G3 by the harness-neutral account pool port; a resumed session SHALL reserve the slot it started on or wait or be reconciled, and cooldown or revocation of a slot SHALL release no held reservation.

#### Scenario: Slot in cooldown
- **WHEN** a slot enters cooldown while attempts hold it
- **THEN** their reservations stay held and the slot receives no new reservation

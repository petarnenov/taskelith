## MODIFIED Requirements

### Requirement: Stale ownership generation
An observation about an attempt SHALL be rejected without effect, with the reason `stale-ownership-generation`, when its ownership generation differs from its task's, or, for an acceptance or refusal, from its assignment's. A rejected observation SHALL still be recorded in the inbox and the cursor. A stale launch rejection, `not-started`, or exit SHALL still clear its producer's capacity refusal, and change nothing else.

#### Scenario: Late acceptance after a refusal
- **WHEN** an assignment was refused, its attempt was placed again at the next generation, and an acceptance at the earlier generation arrives
- **THEN** it changes nothing, its sequence is confirmed, and the rejection is logged with its reason

#### Scenario: Stale launch rejection after a refusal for slots
- **WHEN** a worker refuses the next generation's offer with `worker-slots-exhausted` and then reports a launch rejected with `assignment-not-active` at the earlier generation
- **THEN** it changes no task or assignment, its sequence is confirmed, and the worker is eligible for placement again

#### Scenario: Stale not-started after a refusal for slots
- **WHEN** a worker refuses the next generation's offer with `worker-slots-exhausted` and then reports a `not-started` at the earlier generation
- **THEN** it changes no task, and the worker is eligible for placement again

### Requirement: Acceptance and refusal
An acceptance SHALL accept its assignment. A refusal SHALL end its assignment and release its reservation unless an execution under it can run, leaving the attempt to be placed again. A refusal with `worker-slots-exhausted` or `worker-capacity-exhausted` SHALL make the worker ineligible for placement until its next capacity declaration or slot-freeing observation, and one with `worker-admission-pressure` SHALL record the worker's admission pressure.

#### Scenario: Slots exhausted
- **WHEN** a worker refuses an offer with `worker-slots-exhausted`
- **THEN** the assignment ends as refused, its reservation is released, and the next placement pass does not offer that worker the attempt

### Requirement: Report sequence fences
Each worker SHALL keep four fences: capacity values, pressure, the capacity refusal mark, and the protocol version. A write SHALL apply only when its observation's sequence is above its fence's last applied sequence, which it then advances; a write that does not apply SHALL succeed unchanged, and a write for a worker without a record SHALL fail without advancing any fence. Marking and clearing a capacity refusal SHALL share one fence.

#### Scenario: Late refusal after a newer declaration
- **WHEN** a declaration at sequence 3 is applied and then a `worker-slots-exhausted` refusal at sequence 2 arrives
- **THEN** the assignment ends as refused, and the worker is not marked refused

#### Scenario: Older declaration after a newer refusal
- **WHEN** a `worker-capacity-exhausted` refusal at sequence 3 is applied and then a declaration at sequence 2 arrives
- **THEN** the declaration's capacity values apply, and the worker stays marked refused

#### Scenario: Terminal fact older than a refusal
- **WHEN** a `worker-slots-exhausted` refusal at sequence 3 is applied and then an exit at sequence 2 arrives
- **THEN** the exit ends its attempt, and the worker stays marked refused

#### Scenario: Stale launch rejection older than a refusal
- **WHEN** a `worker-slots-exhausted` refusal at sequence 5 is applied and then a launch rejection at sequence 4 and an earlier generation arrives
- **THEN** it is rejected, and the worker stays marked refused

#### Scenario: Late protocol rejection
- **WHEN** a declaration at sequence 3 is applied and then a protocol rejection of an offer at sequence 2 arrives
- **THEN** the offer's assignment is refused, and the worker keeps the declared protocol version

## MODIFIED Requirements

### Requirement: Worker-side admission limits
Before it accepts an offer, a worker SHALL refuse it with `resource-ceiling-exceeded` above the per-attempt ceiling, `control-not-enforceable` for a hard control it does not declare, `worker-slots-exhausted` when its counted attempts fill its slots, and `worker-capacity-exhausted` when its CPU or memory would be exceeded. Otherwise, under admission pressure, it SHALL refuse it with `worker-admission-pressure`, retryable and naming its causes.

#### Scenario: Slots full
- **WHEN** a worker with two slots holds two accepted assignments that have not ended and receives a third offer
- **THEN** it journals an `execution.assignment.refused` with `worker-slots-exhausted` and acknowledges the offer

#### Scenario: Offer under admission pressure
- **WHEN** a worker below its disk floor receives an offer within its slots and capacity
- **THEN** it journals a retryable `worker-admission-pressure` refusal naming `disk-floor`, records no launch intent, and acknowledges the offer

## ADDED Requirements

### Requirement: Admission pressure reporting
A worker SHALL measure its disk floor and journal backlog at start, at least every 5 seconds, before it accepts an offer, and before each launch authorization request. It SHALL journal `worker.admission-pressure.changed` with the current causes, in contract order, once after each start and whenever they change; an empty list clears the pressure.

#### Scenario: Pressure clears
- **WHEN** the free space of a worker under `disk-floor` rises above the floor
- **THEN** the worker journals `worker.admission-pressure.changed` with no causes, and accepts the next offer that fits

#### Scenario: Restart without pressure
- **WHEN** a worker starts again with no limit exceeded
- **THEN** it journals one `worker.admission-pressure.changed` with no causes, which clears any pressure an earlier process reported

### Requirement: Disk floor
A worker SHALL report `disk-floor` while the free space of its data root's volume is below 5 GiB or 10% of the volume, whichever is larger. Below the floor it SHALL empty the regular files under `worker/logs/`, following no link, and SHALL remove no journal, inbox, or outbox record.

#### Scenario: Buffered logs below the floor
- **WHEN** a worker measures its volume below the floor while `worker/logs/` holds stream logs
- **THEN** each log file is emptied in place, and the journal and the execution records are unchanged

### Requirement: Journal backlog limit
A worker SHALL report `journal-backlog` while its unconfirmed outbox entries exceed 10,000 entries or 256 MiB of stored entries, and SHALL keep publishing them while existing attempts drain and reconcile.

#### Scenario: Backlog over the limit
- **WHEN** the outbox holds 10,001 unconfirmed entries
- **THEN** the worker reports `journal-backlog` and refuses new offers, and the entries are still published

### Requirement: Unmeasurable limit
A limit the worker cannot measure, such as free space that cannot be read, SHALL count as exceeded and SHALL be reported as `unmeasurable-limit`.

#### Scenario: Free space unreadable
- **WHEN** the free space of the data root's volume cannot be read
- **THEN** the worker reports `unmeasurable-limit` and refuses new offers

### Requirement: Launches wait under admission pressure
Under admission pressure a worker SHALL journal no new launch authorization operation and send no launch authorization request; each launch SHALL wait, keeping its intent and reservation, and SHALL continue once the pressure clears. Pressure that cannot be refreshed SHALL count as pressure and SHALL be reported as a failure.

#### Scenario: Accepted assignment under pressure
- **WHEN** an accepted assignment is due to launch while the worker reports `journal-backlog`
- **THEN** no W2 is journaled and no request is sent until the pressure clears, and then the launch proceeds

#### Scenario: Pressure between retries
- **WHEN** pressure arises after a request without a decision
- **THEN** the retry of the same operation waits until the pressure clears, within the operation's deadline rules

## MODIFIED Requirements

### Requirement: Admission pressure reporting
A worker SHALL measure its disk floor, journal backlog, and daemon overhead at start, at least every 5 seconds, before it accepts an offer, and before each launch authorization request. It SHALL journal `worker.admission-pressure.changed` with the current causes, in contract order, once after each start and whenever they change; an empty list clears the pressure.

#### Scenario: Pressure clears
- **WHEN** the free space of a worker under `disk-floor` rises above the floor
- **THEN** the worker journals `worker.admission-pressure.changed` with no causes, and accepts the next offer that fits

#### Scenario: Restart without pressure
- **WHEN** a worker starts again with no limit exceeded
- **THEN** it journals one `worker.admission-pressure.changed` with no causes, which clears any pressure an earlier process reported

## ADDED Requirements

### Requirement: Daemon overhead
A worker SHALL report `daemon-memory` while its own resident set exceeds 512 MiB and `event-loop-lag` while the p99 event-loop delay of its 15-second sample window exceeds 200 ms, reading both through a sensor port. An overhead it cannot read, including a window without a sample, SHALL be reported as `unmeasurable-limit`.

#### Scenario: Overhead subsides
- **WHEN** a worker's resident set rises above 512 MiB and later falls below it
- **THEN** it journals `worker.admission-pressure.changed` with `daemon-memory`, refuses offers and holds launches meanwhile, and then journals no causes

#### Scenario: Lag that cannot be read
- **WHEN** the event-loop delay cannot be read
- **THEN** the worker reports `unmeasurable-limit` and refuses new offers

### Requirement: Journal writes refused for lack of space
On a journal write refused for lack of space a worker SHALL empty the buffered logs under `worker/logs/`. A refused command SHALL stay unacknowledged for redelivery. A refused execution fact SHALL be derived again from its record and retried after a backoff of 5 to 60 seconds with jitter, not reported as a failure, until it commits or the worker stops.

#### Scenario: Exit refused for space
- **WHEN** the commit of an execution's exit is refused for lack of space twice
- **THEN** the worker reads the record again after each backoff, and the outbox holds one `execution.exited`

#### Scenario: Not-started refused for space after a seal
- **WHEN** the worker seals an execution and the commit of its `execution.not-started` is refused for lack of space
- **THEN** the worker retries it after the backoff without reporting a failure, and the outbox holds one `execution.not-started`

#### Scenario: Command refused for space
- **WHEN** W1 of an offer is refused for lack of space
- **THEN** the offer is not acknowledged, and its redelivery is journaled

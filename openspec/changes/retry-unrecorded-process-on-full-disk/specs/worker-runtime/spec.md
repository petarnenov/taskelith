## MODIFIED Requirements

### Requirement: Journal writes refused for lack of space
On a journal write refused for lack of space a worker SHALL empty the buffered logs under `worker/logs/`. A refused command SHALL stay unacknowledged for redelivery. A refused execution fact SHALL be derived again from its record, a refused launch write retried unchanged before what it precedes, and a refused unrecorded process journaled by a later pass, after a backoff of 5 to 60 seconds with jitter, not reported as a failure, until it commits or the worker stops.

#### Scenario: Exit refused for space
- **WHEN** the commit of an execution's exit is refused for lack of space twice
- **THEN** the worker reads the record again after each backoff, and the outbox holds one `execution.exited`

#### Scenario: Not-started refused for space after a seal
- **WHEN** the worker seals an execution and the commit of its `execution.not-started` is refused for lack of space
- **THEN** the worker retries it after the backoff without reporting a failure, and the outbox holds one `execution.not-started`

#### Scenario: Grant refused for space
- **WHEN** the commit of a grant is refused for lack of space
- **THEN** the worker retries it for the same operation after the backoff, starts the supervisor only after it commits, and the execution runs without a restart

#### Scenario: Command refused for space
- **WHEN** W1 of an offer is refused for lack of space
- **THEN** the offer is not acknowledged, and its redelivery is journaled

#### Scenario: Unrecorded process refused for space
- **WHEN** the commit of an unrecorded process found at start is refused for lack of space twice
- **THEN** no pass tries it within the backoff, and the outbox then holds one `unrecorded-process` with its containment's identity, without a second scan or a reported failure

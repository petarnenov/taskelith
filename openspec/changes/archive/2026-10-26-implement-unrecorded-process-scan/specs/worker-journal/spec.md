## MODIFIED Requirements

### Requirement: Local outbox
A worker SHALL publish only committed observations, each with a deterministic identity derived from its source fact and a gapless sequence per journal incarnation, SHALL keep each until the control plane confirms it, and SHALL publish an unconfirmed one again with the same identity. An unrecorded process SHALL take its identity from the journal and its containment. Above the backlog limit it SHALL accept no new attempt.

#### Scenario: Fact derived again after a lost write
- **WHEN** a fact's journal write was lost and the worker reads the fact again from its execution record
- **THEN** the observation gets the same identity and the receiver deduplicates it

#### Scenario: Observation expired from the stream
- **WHEN** the broker acknowledged an observation and the stream expired it before the control plane consumed it
- **THEN** the worker still holds it unconfirmed and publishes it again

#### Scenario: Unrecorded process found again
- **WHEN** a later start of the same journal incarnation finds the same populated containment without an execution record
- **THEN** the worker journals no second entry while the first is unconfirmed, and one derived after confirmation has the same identity

## MODIFIED Requirements

### Requirement: Execution ownership
An attempt SHALL have at most one owning execution, spawned at most once across all its grants. Expiry SHALL end the permission to spawn but not ownership; another execution identity SHALL be authorized only after the owner has a recorded exit or a `not-started` recorded after its seal, including one the request reports, recorded first in the same transaction.

#### Scenario: Expired grant without a recorded start
- **WHEN** an authorization expired and no start or terminal fact is recorded
- **THEN** an authorization for another execution identity is rejected with `execution-conflict`

#### Scenario: Two grants for one execution
- **WHEN** an execution is authorized again after its first grant expired unused
- **THEN** the supervisor spawns it at most once across both grants

#### Scenario: Sealed execution
- **WHEN** `not-started` is recorded after the worker sealed the launch record
- **THEN** a supervisor resumed later does not spawn under any grant of that execution

#### Scenario: Reported seal before its observation
- **WHEN** a request for a new execution reports the `authorized` owner of its attempt as sealed, before the owner's `not-started` observation arrives
- **THEN** one transaction records the owner `not-started` and grants the new execution, and the later observation is a duplicate

#### Scenario: Reported seal after its observation
- **WHEN** the reported execution is already `not-started`, or the authority never granted it
- **THEN** the report changes nothing and the new execution is decided by the ownership rule

#### Scenario: Refused seal report
- **WHEN** the reported execution is `started` or `exited`, belongs to another attempt or worker, or the reported operation granted another execution
- **THEN** the request is rejected with `execution-conflict` and nothing is recorded for either execution

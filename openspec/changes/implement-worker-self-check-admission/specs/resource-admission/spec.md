## MODIFIED Requirements

### Requirement: Bounded supersession and retries
`supersede` SHALL end and release an assignment without a grant whose worker is unknown, revoked, draining, unreachable, or not admitted, or that exceeded the 2 minute acknowledgement or 10 minute admission pressure bound, and SHALL otherwise fail with `precondition-failed`; `reserveWithRetry` SHALL retry an `unavailable` placement at most 5 times in all with delays within 5 to 60 seconds.

#### Scenario: Unreachable worker
- **WHEN** the worker of an ungranted assignment becomes unreachable and the assignment is superseded
- **THEN** it ends as superseded, its reservation is released, and the worker gets an assignment-ended command

#### Scenario: Worker whose self-check failed
- **WHEN** the worker of an accepted assignment without a grant becomes `self-check-failed`
- **THEN** the assignment is due at once, the report's transaction frees it as superseded, its reservation is released, and the worker gets an assignment-ended command

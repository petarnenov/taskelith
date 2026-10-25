## MODIFIED Requirements

### Requirement: Assigned worker
Only the assigned worker SHALL accept or refuse an assignment, and another worker SHALL be rejected with `forbidden`. A refusal SHALL carry a worker-side reason of the capacity reservation contract section 11, or `protocol-not-supported` for an offer its worker rejected for its protocol version; an accepted assignment SHALL NOT be refused for admission pressure, which it waits out.

#### Scenario: Refusal by another worker
- **WHEN** a worker refuses an assignment held by another worker
- **THEN** the refusal is rejected with `forbidden` and the assignment is unchanged

#### Scenario: Pressure after acceptance
- **WHEN** an accepted assignment is refused for admission pressure
- **THEN** the refusal is rejected with `precondition-failed`, and the assignment keeps its reservation

#### Scenario: Unsupported protocol version
- **WHEN** an offer is refused with `protocol-not-supported`, after its worker rejected the command for its protocol version
- **THEN** the assignment ends as refused and its reservation is released

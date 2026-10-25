## MODIFIED Requirements

### Requirement: Worker credentials
Enrollment SHALL return a control-plane bearer secret and a NATS `.creds` file of generation 1. A rotation SHALL issue the next generation and keep the previous one valid only for the grace window. A revocation SHALL deny every credential of the worker at once.

#### Scenario: Grace window
- **WHEN** a worker's credentials are rotated and the grace window passes
- **THEN** the previous control-plane secret is refused and the previous broker user is revoked

#### Scenario: Due row without a predecessor
- **WHEN** the expiry sweep meets a worker that is due by its stored expiry time but whose record holds no previous credential
- **THEN** the sweep records no revocation for it, clears its stored expiry time so that a later sweep does not meet it again, expires every other due predecessor, and counts only the predecessors it expired

#### Scenario: Due row without an enrollment record
- **WHEN** a worker row is due by its stored expiry time but holds no enrollment record
- **THEN** the sweep does not select it and expires every other due predecessor

#### Scenario: Predecessor still in its grace window
- **WHEN** a worker is due by its stored expiry time but its record's previous credential is valid until a later time
- **THEN** the sweep keeps the previous credential, records no revocation, sets the stored expiry time back to the record's, and expires it only when that time has passed

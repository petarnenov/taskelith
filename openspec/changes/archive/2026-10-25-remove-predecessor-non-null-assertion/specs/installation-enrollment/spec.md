## MODIFIED Requirements

### Requirement: Worker credentials
Enrollment SHALL return a control-plane bearer secret and a NATS `.creds` file of generation 1. A rotation SHALL issue the next generation and keep the previous one valid only for the grace window. A revocation SHALL deny every credential of the worker at once.

#### Scenario: Grace window
- **WHEN** a worker's credentials are rotated and the grace window passes
- **THEN** the previous control-plane secret is refused and the previous broker user is revoked

#### Scenario: Due row without a predecessor
- **WHEN** the expiry sweep meets a worker that is due by its stored expiry time but whose record holds no previous credential
- **THEN** the sweep skips that worker without failing, records no revocation for it, expires every other due predecessor, and counts only the predecessors it expired

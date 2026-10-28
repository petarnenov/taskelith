## MODIFIED Requirements

### Requirement: Worker credentials
Enrollment SHALL return a control-plane bearer secret and a NATS `.creds` file of generation 1. A rotation SHALL give the worker the next generation and keep the previous one valid until the worker confirms the new one or the rotation's deadline passes. A revocation SHALL deny every credential of the worker at once.

#### Scenario: Confirmation drops the predecessor
- **WHEN** a worker renews a requested generation and confirms it
- **THEN** the previous control-plane secret is refused at once and the previous broker user is recorded for revocation and published

#### Scenario: Grace window
- **WHEN** a worker renewed the requested generation but has not confirmed it when the rotation's deadline passes
- **THEN** the sweep refuses the previous control-plane secret, revokes the previous broker user, keeps the new generation valid, and writes `worker-credential.rotation-expired` with reason `unconfirmed`

#### Scenario: Deadline without a renewal
- **WHEN** the deadline of a requested rotation passes and the worker never renewed it
- **THEN** the sweep revokes the worker, every credential of it is refused, and the audit event has reason `rotation-expired`

#### Scenario: Due row without a predecessor
- **WHEN** the expiry sweep meets a worker that is due by its stored expiry time but whose record holds no previous credential
- **THEN** the sweep records no revocation for it, clears its stored expiry time so that a later sweep does not meet it again, expires every other due predecessor, and counts only the predecessors it expired

#### Scenario: Due row without an enrollment record
- **WHEN** a worker row is due by its stored expiry time but holds no enrollment record
- **THEN** the sweep does not select it and expires every other due predecessor

#### Scenario: Predecessor still in its grace window
- **WHEN** a worker is due by its stored expiry time but its record's previous credential is valid until a later time
- **THEN** the sweep keeps the previous credential, records no revocation, sets the stored expiry time back to the record's, and expires it only when that time has passed

### Requirement: Worker bearer authentication
A worker's control-plane secret SHALL authenticate without its worker identifier, by the hash of the secret, and SHALL name the worker and the generation it is of. A predecessor SHALL authenticate only until its successor is confirmed or the rotation's deadline passes. An unknown secret, a revoked worker, and a dropped or expired predecessor SHALL fail alike with `forbidden` and reason `worker-not-authorized`.

#### Scenario: Predecessor within the grace window
- **WHEN** a worker renewed a requested generation and presents the previous control-plane secret before it confirms the new one and before the deadline
- **THEN** it authenticates as that worker with the previous generation

#### Scenario: Revoked worker
- **WHEN** a revoked worker presents its current control-plane secret
- **THEN** authentication fails with `forbidden` and reason `worker-not-authorized`

## ADDED Requirements

### Requirement: Rotation request
`rotate-worker` SHALL require an actor and a reason and SHALL only request the next generation: it SHALL record the request with a deadline of max(grace window, 7 days) from the request, an audit event, and the worker's notice in one transaction, and SHALL print no secret. While a rotation is open, a repeat SHALL answer the same request, write no audit event, and send the notice again. A revoked worker SHALL get no rotation.

#### Scenario: Requested rotation
- **WHEN** the operator runs `rotate-worker` for an enrolled worker
- **THEN** the output names the worker, the next generation, and the deadline, contains no `tkwk_` secret, seed, or JWT, and the worker's command subject gets `worker.credentials.rotation-requested`

#### Scenario: Repeated request
- **WHEN** `rotate-worker` runs again before the open rotation is confirmed or expired
- **THEN** it answers the same generation and deadline and the audit trail holds one request event

### Requirement: Credential renewal
A renewal SHALL authenticate with the generation before the requested one and carry only the worker-generated NKey public key and the SHA-256 of the worker-generated bearer secret. It SHALL make that generation current and answer a user JWT signed for the key and the deadline; the same key and hash again SHALL get the same JWT. No open rotation to it SHALL be `conflict`, reason `rotation-not-requested`; another key or hash `renewal-mismatch`.

#### Scenario: Renewal without a request
- **WHEN** a worker renews while no rotation of its next generation is open
- **THEN** the renewal fails with `conflict` and reason `rotation-not-requested`, and the worker's credentials are unchanged

#### Scenario: Repeated renewal
- **WHEN** a worker renews the same generation twice with the same key and hash
- **THEN** both answers carry the same JWT and deadline, and the audit trail holds one renewal event

#### Scenario: Other key for a renewed generation
- **WHEN** a renewed generation is renewed again with another public key
- **THEN** the renewal fails with `conflict` and reason `renewal-mismatch`

#### Scenario: First renewal after the deadline
- **WHEN** a worker renews a requested generation for the first time at or after the deadline, read after the record's lock, before the sweep ran
- **THEN** the renewal fails with `forbidden` and reason `worker-not-authorized`, the credentials are unchanged, and the next sweep revokes the worker

### Requirement: Credential confirmation
A confirmation SHALL authenticate with the generation it names, and SHALL drop the predecessor at once, recording its broker user for revocation and publishing the revocations after the commit. At or after the deadline it SHALL instead expire the predecessor as the sweep does. Confirming the current generation with no renewed rotation open SHALL succeed, drop nothing, and publish any unpublished revocation. Any other confirmation SHALL be `conflict` with reason `confirmation-mismatch`.

#### Scenario: Confirmation with the old bearer
- **WHEN** a worker confirms its renewed generation with the bearer of the previous one
- **THEN** the confirmation fails with `conflict` and reason `confirmation-mismatch`, and the previous generation stays valid

#### Scenario: Repeated confirmation
- **WHEN** a confirmed generation is confirmed again
- **THEN** the answer names it again, nothing is dropped, and the audit trail holds one confirmation event

#### Scenario: Repeated confirmation after a failed publication
- **WHEN** a confirmation's revocation publication failed and the generation is confirmed again while the broker still refuses the publication
- **THEN** the answer has `revocationsPublished: false` again, and once the broker accepts it a repeat answers `true`

#### Scenario: Confirmation after the deadline
- **WHEN** a worker confirms its renewed generation at or after the deadline, before or after the sweep ran
- **THEN** the answer succeeds, the predecessor is dropped, and the audit trail holds `worker-credential.rotation-expired` with reason `unconfirmed` and no confirmation event

### Requirement: Credential audit events
Every audit event SHALL name its subject: `operator` for the operator credential's events and the worker identifier for a worker's. The rotation request, the renewal, the confirmation, and the expiry at the deadline SHALL each write one immutable event, `worker-credential.rotation-requested`, `.renewed`, `.confirmed`, and `.rotation-expired`, naming the new generation. A refused renewal SHALL be logged only.

#### Scenario: Audit trail of a rotation
- **WHEN** a rotation is requested, renewed, and confirmed
- **THEN** the worker's audit trail lists the request, the renewal, and the confirmation in that order, each with the worker as subject and the new generation

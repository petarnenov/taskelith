# installation-enrollment Specification

## Purpose
Installation initialization, the operator credential, worker enrollment with its credentials and broker permissions, the control-plane namespace, TLS plumbing, and secret scrubbing.

## Requirements

### Requirement: Explicit initialization
Only the administrative `init` SHALL initialize an installation, writing `installationId` and `recoveryEpoch = 1` first to `control-plane/installation`, then to the database, then issuing the one-time operator bootstrap credential. A start SHALL fail closed when the two records are missing or differ.

#### Scenario: Second initialization
- **WHEN** `init` runs on an initialized installation
- **THEN** it fails with `conflict`

#### Scenario: Restored database
- **WHEN** the database copy differs from the record outside it
- **THEN** the enrollment service does not start and reports `precondition-failed`

### Requirement: Operator credential reset
A reset SHALL require a direct invocation on the control-plane host with an actor and a reason, SHALL replace the credential with the next generation, and SHALL write an immutable audit event. The previous credential SHALL stop authenticating.

#### Scenario: Reset
- **WHEN** the operator credential is reset
- **THEN** the old secret is refused, the new one authenticates, and the audit trail lists the bootstrap and the reset

### Requirement: Single-use enrollment
An enrollment token SHALL be stored only as its hash, used once, and valid for the provisional TTL. Enrollment SHALL refuse an unknown, used, or expired token (`token-invalid`), a host outside its constraints (`host-mismatch`), no common protocol version (`protocol-not-supported`), and an enrolled journal (`journal-enrolled`).

#### Scenario: Token reuse
- **WHEN** a used token is presented again
- **THEN** enrollment fails with `forbidden` and reason `token-invalid`

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

### Requirement: Broker permissions and revocation
A worker's broker user SHALL publish only to its own consumer API, acknowledgements, observation subject, and heartbeat subject, and subscribe only under its own inbox prefix. A revocation SHALL reach the server through the system account without a reload, and SHALL disconnect the user.

#### Scenario: Forged observation
- **WHEN** a worker publishes on another worker's observation subject
- **THEN** the server reports a permissions violation

#### Scenario: Forged heartbeat
- **WHEN** a worker publishes a heartbeat on its own and on another worker's heartbeat subject
- **THEN** only its own heartbeat is delivered, and the server reports a permissions violation for the other

#### Scenario: Revoked worker
- **WHEN** a connected worker is revoked
- **THEN** the server disconnects it and refuses its next connection

### Requirement: Control-plane namespace
The `control-plane/` subtree SHALL consist of owner-only directories and files, contain no symbolic link, lie outside a Git working tree, and hold versioned documents; it SHALL refuse a document of another format.

#### Scenario: Symbolic link
- **WHEN** `control-plane` is a symbolic link
- **THEN** opening the namespace fails with reason `unsafe-path`

### Requirement: Installation certificate authority
`init` SHALL create an installation certificate authority once, keep its key in an owner-only file of the `control-plane/` namespace, and write its public certificate beside it. A rerun SHALL keep the authority, and `init` and `issue-installation-certificates` of an initialized installation without it SHALL fail with `precondition-failed`. A NATS client SHALL accept a CA and an optional client certificate; when to require one is the nats-transport requirement "Installation broker TLS".

#### Scenario: Wrong CA
- **WHEN** a client trusts a CA that did not sign the server's certificate
- **THEN** the connection fails

#### Scenario: Rerun keeps the authority
- **WHEN** `init` runs again after a failure that followed the authority's creation
- **THEN** the authority's certificate is unchanged

#### Scenario: Lost authority
- **WHEN** an initialized installation's authority file is missing and `init` or `issue-installation-certificates` runs
- **THEN** it fails with `precondition-failed` and creates no new authority

### Requirement: Secret scrubbing
Failures that leave the process SHALL have bearer secrets, NKey seeds, NATS JWTs, `.creds` blocks, and PEM private keys redacted, and a child process's environment SHALL keep no secret variable or value.

#### Scenario: Failure with a secret
- **WHEN** a failure's message or details contain a worker secret
- **THEN** the printed failure shows `[redacted]` in its place

#### Scenario: Private key in a failure
- **WHEN** a failure's message contains a PEM private-key block, whole or cut, beside a PEM certificate
- **THEN** the printed failure shows `[redacted]` for the key and keeps the certificate

### Requirement: Worker bearer authentication
A worker's control-plane secret SHALL authenticate without its worker identifier, by the hash of the secret, and SHALL name the worker and the generation it is of. A predecessor SHALL authenticate only until its successor is confirmed or the rotation's deadline passes. An unknown secret, a revoked worker, and a dropped or expired predecessor SHALL fail alike with `forbidden` and reason `worker-not-authorized`.

#### Scenario: Predecessor within the grace window
- **WHEN** a worker renewed a requested generation and presents the previous control-plane secret before it confirms the new one and before the deadline
- **THEN** it authenticates as that worker with the previous generation

#### Scenario: Current generation of an unrenewed rotation
- **WHEN** the deadline of a rotation passes and the worker never renewed it
- **THEN** its current control-plane secret still authenticates as that worker until the sweep revokes the worker

#### Scenario: Revoked worker
- **WHEN** a revoked worker presents its current control-plane secret
- **THEN** authentication fails with `forbidden` and reason `worker-not-authorized`

### Requirement: Worker command consumer
Enrollment SHALL ensure the durable command consumer of the new worker before it uses the token, and SHALL fail with `unavailable` (503) without using the token when it cannot. A control-plane start SHALL ensure the consumer of every enrolled worker that is not revoked, and SHALL log a failure without failing the start.

#### Scenario: Broker unavailable at enrollment
- **WHEN** the consumer cannot be created during an enrollment
- **THEN** the enrollment fails with `unavailable`, and the token can still enroll a worker

#### Scenario: Lost consumer
- **WHEN** an active worker's consumer was deleted while the control plane was stopped
- **THEN** the next start creates it again

#### Scenario: Consumer that cannot be ensured at start
- **WHEN** the broker refuses one active worker's consumer during a start
- **THEN** the failure is logged with the worker, the other consumers are ensured, and the start continues

### Requirement: Revoked worker command consumer
A revocation SHALL remove the worker's command consumer after the revocation commits, and SHALL report a failed removal without failing the revocation. A control-plane start SHALL remove the consumers of the most recently revoked workers, up to the bound of the operational targets, and SHALL log a failure without failing the start. A missing consumer SHALL count as removed.

#### Scenario: Revoked worker's consumer
- **WHEN** a worker is revoked
- **THEN** its command consumer is removed, and the consumers of the active workers are untouched

#### Scenario: Consumer that cannot be removed at revocation
- **WHEN** the broker refuses the removal of a revoked worker's consumer
- **THEN** the worker stays revoked, the revocation reports the consumer as not removed, and the next start that reaches the broker removes it while the worker is among the most recently revoked

#### Scenario: Consumer already removed
- **WHEN** the consumer of a revoked worker is removed again
- **THEN** the removal succeeds

### Requirement: Worker admission on the self-check
A worker SHALL be `awaiting-self-check` from its enrollment and from each new journal incarnation until the control plane consumes a self-check report of it. Each report above the worker's self-check fence SHALL make it `admitted` when no result failed, and `self-check-failed` otherwise, and SHALL replace its stored results. Placement SHALL place only on an `admitted` worker.

#### Scenario: Newly enrolled worker
- **WHEN** a worker is enrolled and no self-check report of it has been consumed
- **THEN** it is `awaiting-self-check` and placement offers it nothing

#### Scenario: Failed check
- **WHEN** a report names the `linux-containment` check as `failed` with its problems
- **THEN** the worker is `self-check-failed`, its stored results hold that check with those problems, and placement offers it nothing

#### Scenario: Passing report after a failure
- **WHEN** a `self-check-failed` worker reports a later self-check with no failed result
- **THEN** it is `admitted`, its stored results are replaced, and placement may offer it work

#### Scenario: Linux worker without a launch command
- **WHEN** a Linux worker without a launch command reports `linux-containment` as `not-applicable` with `no-launch-command`
- **THEN** the worker is `admitted`

#### Scenario: macOS worker
- **WHEN** a macOS worker reports `linux-containment` as `not-applicable` with `platform-not-covered`
- **THEN** the worker is `admitted` and its stored result is `not-applicable` with that reason

#### Scenario: Stale report
- **WHEN** a report arrives at or below the worker's self-check fence
- **THEN** the worker admission and the stored results are unchanged

#### Scenario: New journal incarnation
- **WHEN** an `admitted` worker's journal is replaced
- **THEN** it is `awaiting-self-check` and its stored results are cleared

### Requirement: Report results checked by the control plane
For a report that passes the wire schema, the control plane SHALL count a `not-applicable` result as `failed` unless it holds exactly one recognised reason that agrees with the worker's enrolled platform and the check's scope, SHALL count a required check missing from a report as `failed`, and SHALL store a check named more than once as one `failed` result.

#### Scenario: Linux worker claiming another platform
- **WHEN** a Linux worker reports `linux-containment` as `not-applicable` with `platform-not-covered`
- **THEN** the result is stored as `failed` and the worker is `self-check-failed`

#### Scenario: Malformed reason
- **WHEN** a report names a check as `not-applicable` with a reason other than `platform-not-covered` or `no-launch-command`
- **THEN** the wire schema refuses the report, it is quarantined unapplied, and the worker admission and stored results are unchanged

#### Scenario: Check reported twice
- **WHEN** an `admitted` worker's report names `linux-containment` twice, with equal or different results
- **THEN** one `failed` result is stored for it and the worker is `self-check-failed`

#### Scenario: Missing required check
- **WHEN** a report omits `linux-containment`
- **THEN** a `failed` result is stored for it and the worker is `self-check-failed`

### Requirement: Running executions survive a failed self-check
When a worker becomes `self-check-failed`, each of its executions already running SHALL keep its assignment, ownership, and reservation until it ends normally; a failed self-check SHALL revoke no grant.

#### Scenario: Execution running during a failed self-check
- **WHEN** a worker with an accepted, running attempt reports a failed self-check
- **THEN** the assignment does not end, and the attempt's later exit ends the task as usual

### Requirement: New grants only for admitted workers
The launch authority SHALL refuse a new launch operation of a worker that is not `admitted` with the non-retryable `worker-not-authorized`, and SHALL answer a replay of a grant recorded earlier as it would for an admitted worker.

#### Scenario: Grant after a failed self-check
- **WHEN** a `self-check-failed` worker requests a new launch operation
- **THEN** the operation is rejected with `worker-not-authorized`, final for that operation

#### Scenario: Replay after a failed self-check
- **WHEN** a worker that became `self-check-failed` repeats an operation that was granted while it was `admitted`
- **THEN** the recorded grant is answered

### Requirement: Installation server certificates
The installation authority SHALL issue the server certificates of the worker API and of NATS, valid for 397 days, with the DNS names and IP addresses of `TASKELITH_API_HOSTS` and `TASKELITH_NATS_HOSTS`. `init` and `issue-installation-certificates` SHALL write each certificate and key as owner-only files of the namespace. An invalid host list SHALL fail and name its variable. An expired authority, or one that ends before the server certificate, SHALL be refused with `precondition-failed`.

#### Scenario: Issued names
- **WHEN** `issue-installation-certificates` runs with `TASKELITH_API_HOSTS=control-plane,127.0.0.1`
- **THEN** the API certificate verifies against the authority for `control-plane` and `127.0.0.1` and not for another name

#### Scenario: Wildcard host
- **WHEN** `TASKELITH_NATS_HOSTS` holds `*.example.com`
- **THEN** the command fails with `invalid` and names `TASKELITH_NATS_HOSTS`

#### Scenario: Authority near its end
- **WHEN** `issue-installation-certificates` runs while the authority expires within 397 days
- **THEN** it fails with `precondition-failed`, names authority rollover as G6 work, and changes no file

### Requirement: Workers view in the administrative entry
The administrative command `worker-admission` SHALL print the workers view as JSON only after it verifies the operator credential from `TASKELITH_OPERATOR_TOKEN`, and SHALL redact every stored check detail again before it prints it. A wrong credential SHALL fail with `forbidden` and print no view.

#### Scenario: Operator reads the view
- **WHEN** the operator runs `worker-admission` with the operator credential after a worker enrolled
- **THEN** it prints that worker as `awaiting-self-check` with no results and exits with 0

#### Scenario: Wrong credential
- **WHEN** `worker-admission` runs with another credential
- **THEN** it exits with 1 and prints only a `forbidden` error

#### Scenario: Secret in a detail
- **WHEN** a stored check detail holds a value shaped like a secret
- **THEN** the printed view holds the redaction marker in its place

### Requirement: Installation CA fingerprint in the enrollment bundle
`issue-enrollment-token` SHALL print the token with `installationCaSha256`, the SHA-256 of the installation CA certificate's DER as 64 lowercase hexadecimal digits. After it authorizes the operator, it SHALL read `installation-ca.pem` under the namespace's checks before it issues the token; a file that is missing or holds anything but one CA certificate SHALL fail the command with `precondition-failed`, name the file, and issue no token.

#### Scenario: Bundle
- **WHEN** the operator issues an enrollment token
- **THEN** the output holds `enrollmentToken` and `installationCaSha256`, which equals the SHA-256 of the DER of `installation-ca.pem`

#### Scenario: Missing installation CA
- **WHEN** an initialized installation's `installation-ca.pem` is missing and the operator issues an enrollment token
- **THEN** the command fails with `precondition-failed`, names the file, and no token is stored

#### Scenario: Unauthorized operator without the CA
- **WHEN** `installation-ca.pem` is missing and a caller with a wrong operator secret issues an enrollment token
- **THEN** the command fails with `forbidden`, not `precondition-failed`

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
Every credential event in `audit_events` SHALL name its subject: `operator` for the operator credential's events and the worker identifier for a worker's; access audit events have their own table and model. The rotation request, the renewal, the confirmation, and the expiry at the deadline SHALL each write one immutable event, `worker-credential.rotation-requested`, `.renewed`, `.confirmed`, and `.rotation-expired`, naming the new generation. A refused renewal SHALL be logged only.

#### Scenario: Audit trail of a rotation
- **WHEN** a rotation is requested, renewed, and confirmed
- **THEN** the worker's audit trail lists the request, the renewal, and the confirmation in that order, each with the worker as subject and the new generation

#### Scenario: Refused renewal
- **WHEN** a renewal is refused with `invalid`, `forbidden`, or `conflict`
- **THEN** the control plane logs `fleet.credentials.renewal-refused` with the worker, the generation, the code, and the reason, no key or hash, and writes no audit event

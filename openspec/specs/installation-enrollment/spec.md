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
A worker's control-plane secret SHALL authenticate without its worker identifier, by the hash of the secret, and SHALL name the worker and the generation it is of. A predecessor SHALL authenticate only within its grace window. An unknown secret, a revoked worker, and a secret past the grace window SHALL fail alike with `forbidden` and reason `worker-not-authorized`.

#### Scenario: Predecessor within the grace window
- **WHEN** a worker's credentials are rotated and the previous control-plane secret is presented within the grace window
- **THEN** it authenticates as that worker with the previous generation

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

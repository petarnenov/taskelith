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

### Requirement: Broker permissions and revocation
A worker's broker user SHALL publish only to its own consumer API, acknowledgements, and observation subject, and subscribe only under its own inbox prefix. A revocation SHALL reach the server through the system account without a reload, and SHALL disconnect the user.

#### Scenario: Forged observation
- **WHEN** a worker publishes on another worker's observation subject
- **THEN** the server reports a permissions violation

#### Scenario: Revoked worker
- **WHEN** a connected worker is revoked
- **THEN** the server disconnects it and refuses its next connection

### Requirement: Control-plane namespace
The `control-plane/` subtree SHALL consist of owner-only directories and files, contain no symbolic link, lie outside a Git working tree, and hold versioned documents; it SHALL refuse a document of another format.

#### Scenario: Symbolic link
- **WHEN** `control-plane` is a symbolic link
- **THEN** opening the namespace fails with reason `unsafe-path`

### Requirement: TLS plumbing
Every NATS connection SHALL accept a CA and an optional client certificate, and SHALL stay plain without one.

#### Scenario: Wrong CA
- **WHEN** a client trusts a CA that did not sign the server's certificate
- **THEN** the connection fails

### Requirement: Secret scrubbing
Failures that leave the process SHALL have bearer secrets, NKey seeds, NATS JWTs, and `.creds` blocks redacted, and a child process's environment SHALL keep no secret variable or value.

#### Scenario: Failure with a secret
- **WHEN** a failure's message or details contain a worker secret
- **THEN** the printed failure shows `[redacted]` in its place

### Requirement: Worker bearer authentication
A worker's control-plane secret SHALL authenticate without its worker identifier, by the hash of the secret, and SHALL name the worker and the generation it is of. A predecessor SHALL authenticate only within its grace window. An unknown secret, a revoked worker, and a secret past the grace window SHALL fail alike with `forbidden` and reason `worker-not-authorized`.

#### Scenario: Predecessor within the grace window
- **WHEN** a worker's credentials are rotated and the previous control-plane secret is presented within the grace window
- **THEN** it authenticates as that worker with the previous generation

#### Scenario: Revoked worker
- **WHEN** a revoked worker presents its current control-plane secret
- **THEN** authentication fails with `forbidden` and reason `worker-not-authorized`

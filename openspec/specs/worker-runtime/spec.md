# worker-runtime Specification

## Purpose
The worker application of a Taskelith installation: its settings, its enrollment on the first start, its start sequence, and later its command intake, launches, reconciliation, and operational limits.

## Requirements

### Requirement: Enrollment on first start
A worker whose root holds no identity SHALL enroll only with the token its configuration names, after it claimed the root, and SHALL create its journal only after the control plane enrolled it. Without a token, or after a refused or failed enrollment, it SHALL leave no `worker/` subtree. A worker with an identity SHALL NOT enroll again.

#### Scenario: Refused token
- **WHEN** the control plane refuses the token with `token-invalid`
- **THEN** the start fails with that reason, and no `worker/` subtree exists

#### Scenario: Root that cannot be created
- **WHEN** the data root's volume is unsupported, or a `worker/` without an identity exists
- **THEN** the start fails without an enrollment request

### Requirement: Start sequence
A worker SHALL take the root lock and pass the journal fault check before any request or connection, and SHALL then connect to the broker with its stored broker credential and its own inbox prefix. A failed connection SHALL fail the start and release the root.

#### Scenario: Journal fault
- **WHEN** a journal fault of the current host boot is recorded
- **THEN** the start fails without an enrollment request or a broker connection

### Requirement: Outbound connections only
A worker SHALL open no listening socket; every connection it makes SHALL be outbound.

#### Scenario: Running worker
- **WHEN** a worker has started
- **THEN** the process holds no listening TCP server

### Requirement: Worker settings
The worker SHALL read its data root, control-plane URL, broker URL and CA, enrollment token, and declared capacity from its environment. The capacity SHALL default to the configured slots, default 2, and the host's CPU and memory less the daemon's 512 MiB. A failure SHALL name the variable, never its value.

#### Scenario: Invalid slot count
- **WHEN** `TASKELITH_WORKER_SLOTS` is `0`
- **THEN** the settings fail with `invalid`, naming the variable

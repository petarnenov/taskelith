## MODIFIED Requirements

### Requirement: Enrollment on first start
A worker whose root holds no identity SHALL enroll only with the token and the installation CA fingerprint its configuration names, after it claimed the root, and SHALL create its journal only after the control plane enrolled it. Without a token or a fingerprint, or after a refused or failed enrollment, it SHALL leave no `worker/` subtree. A worker with an identity SHALL NOT enroll again.

#### Scenario: Refused token
- **WHEN** the control plane refuses the token with `token-invalid`
- **THEN** the start fails with that reason, and no `worker/` subtree exists

#### Scenario: Root that cannot be created
- **WHEN** the data root's volume is unsupported, or a `worker/` without an identity exists
- **THEN** the start fails without an enrollment request

#### Scenario: No fingerprint
- **WHEN** an unenrolled worker has a token but no `TASKELITH_INSTALLATION_CA_SHA256`
- **THEN** the start fails with `invalid`, naming the variable, without a request to the control plane

### Requirement: Worker settings
The worker SHALL read its data root, HTTPS control-plane URL, broker URL, enrollment token, installation CA fingerprint, and declared capacity from its environment. The capacity SHALL default to the configured slots, default 2, and the host's CPU and memory less the daemon's 512 MiB. A failure SHALL name the variable, never its value.

#### Scenario: Invalid slot count
- **WHEN** `TASKELITH_WORKER_SLOTS` is `0`
- **THEN** the settings fail with `invalid`, naming the variable

#### Scenario: Plain control-plane URL
- **WHEN** `TASKELITH_CONTROL_PLANE_URL` is an `http:` URL
- **THEN** the settings fail with `invalid`, naming the variable

#### Scenario: Malformed fingerprint
- **WHEN** `TASKELITH_INSTALLATION_CA_SHA256` is not 32 bytes in hexadecimal, with or without colons
- **THEN** the settings fail with `invalid`, naming the variable

### Requirement: Outbound connections only
A worker SHALL open no listening socket; every connection it makes SHALL be outbound. Workers SHALL keep the bearer secret and the broker user JWT over TLS that authenticates the server only.

#### Scenario: Server-only TLS
- **WHEN** an enrolled worker connects to the broker
- **THEN** its TLS names the pinned CA as its only setting, with no client certificate or key, and it authenticates with its stored `.creds`

#### Scenario: Running worker
- **WHEN** a worker has started
- **THEN** the process holds no listening TCP server

#### Scenario: Enrollment over TLS
- **WHEN** a worker enrolls over pinned TLS and starts
- **THEN** the worker creates no listening TCP, pipe, or UDP handle, referenced or not

## ADDED Requirements

### Requirement: Installation CA checked before the token
Before it sends the token, an enrolling worker SHALL read the CA through `readInstallationCa` and SHALL send the token only if the answer is one CA certificate whose SHA-256 equals its fingerprint. Otherwise the start SHALL fail with `precondition-failed` and reason `installation-ca-mismatch`, send no token, and leave no `worker/` subtree. The worker SHALL never trust a CA it did not check this way.

#### Scenario: Fingerprint mismatch
- **WHEN** the CA that the control plane answers has another SHA-256 than the configured fingerprint
- **THEN** the start fails with reason `installation-ca-mismatch`, no request carries the token, and no `worker/` subtree exists

#### Scenario: CA not readable
- **WHEN** `readInstallationCa` does not answer
- **THEN** the start fails with `unavailable`, and no request carries the token

### Requirement: Pinned installation CA
An enrolled worker SHALL keep the checked CA as `worker/installation-ca.pem` and SHALL trust only it for every HTTPS call to the control plane and for its broker TLS, never the system trust store or `NODE_EXTRA_CA_CERTS`; it SHALL verify the server whatever `NODE_TLS_REJECT_UNAUTHORIZED` says and SHALL follow no redirect. A root without the file SHALL fail the start with reason `corrupt` before any request or connection.

#### Scenario: System-trusted foreign certificate
- **WHEN** the control plane's address presents a certificate of another CA that the process's default trust includes
- **THEN** the call fails before its request is sent, and no token or bearer reaches that server
- **AND** an enrollment so refused fails with `precondition-failed` and reason `installation-ca-untrusted`, and its token is not spent

#### Scenario: Verification turned off by the environment
- **WHEN** `NODE_TLS_REJECT_UNAUTHORIZED` is `0` and the control plane's address or the broker presents a certificate of another CA
- **THEN** the call or connection fails, and no token, bearer, or broker credential reaches that server

#### Scenario: Redirect
- **WHEN** the control plane answers a call or the CA read with a redirect, such as 307 or 308 to a plain `http:` URL
- **THEN** the call fails, its target gets no request, and no enrollment succeeds

#### Scenario: Broker trust
- **WHEN** an enrolled worker connects to the broker
- **THEN** its connection's TLS names the pinned CA as its only CA

#### Scenario: Root without the pin
- **WHEN** an enrolled root has no `worker/installation-ca.pem`
- **THEN** the start fails with reason `corrupt` before any request or broker connection

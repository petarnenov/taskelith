## RENAMED Requirements

- FROM: `### Requirement: TLS plumbing`
- TO: `### Requirement: Installation certificate authority`

## MODIFIED Requirements

### Requirement: Installation certificate authority
`init` SHALL create an installation certificate authority once, keep its key in an owner-only file of the `control-plane/` namespace, and write its public certificate beside it. A rerun SHALL keep the authority, and an initialized installation without one SHALL fail with `precondition-failed`. Every NATS connection SHALL accept a CA and an optional client certificate, and SHALL stay plain without one.

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

## ADDED Requirements

### Requirement: Installation server certificates
The installation authority SHALL issue the server certificates of the worker API and of NATS, valid for 397 days, with the DNS names and IP addresses of `TASKELITH_API_HOSTS` and `TASKELITH_NATS_HOSTS`. `init` and `issue-installation-certificates` SHALL write each certificate and key as owner-only files of the namespace. An invalid host list SHALL fail and name its variable.

#### Scenario: Issued names
- **WHEN** `issue-installation-certificates` runs with `TASKELITH_API_HOSTS=control-plane,127.0.0.1`
- **THEN** the API certificate verifies against the authority for `control-plane` and `127.0.0.1` and not for another name

#### Scenario: Wildcard host
- **WHEN** `TASKELITH_NATS_HOSTS` holds `*.example.com`
- **THEN** the command fails with `invalid` and names `TASKELITH_NATS_HOSTS`

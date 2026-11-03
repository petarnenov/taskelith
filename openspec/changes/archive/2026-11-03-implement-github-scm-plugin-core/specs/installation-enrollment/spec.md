## MODIFIED Requirements

### Requirement: Secret scrubbing
Failures that leave the process SHALL have bearer secrets, GitHub App installation tokens, `Authorization: Basic` credentials, NKey seeds, NATS JWTs, `.creds` blocks, and PEM private keys redacted, and a child process's environment SHALL keep no secret variable or value.

#### Scenario: Failure with a secret
- **WHEN** a failure's message or details contain a worker secret
- **THEN** the printed failure shows `[redacted]` in its place

#### Scenario: Private key in a failure
- **WHEN** a failure's message contains a PEM private-key block, whole or cut, beside a PEM certificate
- **THEN** the printed failure shows `[redacted]` for the key and keeps the certificate

#### Scenario: Git header with Basic credentials
- **WHEN** a failure's message or details, or a child process's environment value such as `GIT_CONFIG_VALUE_0`, hold `Authorization: Basic` and credentials
- **THEN** the printed failure shows `[redacted]` in place of the credentials, and the child process does not get that variable

## ADDED Requirements

### Requirement: Rejected broker credentials
A broker failure caused by an authorization violation or an expired user authentication SHALL keep the code `unavailable` and SHALL carry the reason `credentials-rejected`, so that a worker can tell refused credentials from an unreachable broker; every other broker failure SHALL carry no such reason.

#### Scenario: Revoked user
- **WHEN** a worker connects with the `.creds` of a revoked broker user
- **THEN** the connection fails with reason `credentials-rejected`

#### Scenario: Unreachable broker
- **WHEN** the broker cannot be reached
- **THEN** the connection fails without reason `credentials-rejected`

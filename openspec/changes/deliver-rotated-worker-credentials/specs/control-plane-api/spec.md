## MODIFIED Requirements

### Requirement: Background loops and observability
The service SHALL run the outbox publisher, the quarantine keeper, the grace-window sweep, which also enforces rotation deadlines, the observability sampler, and the lag monitor until it stops. It SHALL log every request with its correlation and without any secret.

#### Scenario: Request log
- **WHEN** a request carries `x-correlation-id`
- **THEN** the response echoes it, and its log line carries it with no bearer token

### Requirement: Worker credential scheme
An operation with the `workerCredential` scheme SHALL run only after the server has authenticated the bearer as a worker, and SHALL receive that worker and generation. A refused credential SHALL be answered 401 with the same failure whether it is unknown, revoked, dropped by a confirmation, or past its rotation's deadline, and a store that cannot answer SHALL be answered 503, whatever the route declares.

#### Scenario: Refused worker bearer
- **WHEN** a worker route is called with a bearer that is not a valid worker credential
- **THEN** the answer is 401 with a `Failure` of code `forbidden`, and the operation does not run

## ADDED Requirements

### Requirement: Credential renewal and confirmation operations
`renewWorkerCredentials` and `confirmWorkerCredentials` SHALL run under the worker credential and answer 200 with `CredentialRenewal` and `CredentialConfirmation`; an invalid body or public key SHALL be 400, a refused bearer 401, a `conflict` 409 with its reason, an unavailable store 503, and any other failure 500.

#### Scenario: Renewal answer
- **WHEN** a worker renews a requested generation over HTTP
- **THEN** the answer is 200 with the generation, the JWT for its key, and the deadline, and carries no secret

#### Scenario: Invalid public key
- **WHEN** a renewal names a public key that is not an NKey user key
- **THEN** the answer is 400 and the worker's credentials are unchanged

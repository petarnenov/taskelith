## MODIFIED Requirements

### Requirement: Background loops and observability
The service SHALL run the outbox publisher, the quarantine keeper, the grace-window sweep, which also enforces rotation deadlines, the observability sampler, and the lag monitor until it stops. It SHALL log every request with its correlation and without any secret.

#### Scenario: Request log
- **WHEN** a request carries `x-correlation-id`
- **THEN** the response echoes it, and its log line carries it with no bearer token

### Requirement: Worker credential scheme
An operation with the `workerCredential` scheme SHALL run only after the server has authenticated the bearer as a worker, and SHALL receive that worker and generation. A refused credential SHALL be answered 401 with the same failure whether it is unknown, revoked, or a predecessor dropped by a confirmation or past its rotation's deadline, and a store that cannot answer SHALL be answered 503, whatever the route declares.

#### Scenario: Refused worker bearer
- **WHEN** a worker route is called with a bearer that is not a valid worker credential
- **THEN** the answer is 401 with a `Failure` of code `forbidden`, and the operation does not run

### Requirement: Authentication, CSRF, and role order
For every operation with a session or bearer requirement, the control plane SHALL authenticate, then check the CSRF header on a session-authenticated operation other than GET, then check the caller's role through the `Access` module if the operation requires one, and only then read the request body. `createRun`, whose project is in its body, SHALL validate the body against its schema alone first and read no state before the role check. The bearer SHALL be refused on `logIn` and `logOut`.

#### Scenario: Missing CSRF header
- **WHEN** a session-authenticated mutation arrives without `X-CSRF-Token` or with another session's token
- **THEN** it answers 403 with reason `csrf-token-invalid` and nothing takes effect

#### Scenario: Role before body
- **WHEN** a principal without the required role sends a mutation with an invalid body
- **THEN** the answer is 403 with reason `role-required`, not 400

#### Scenario: Project in the body
- **WHEN** a principal without `project-operator` on the named project calls `createRun` with a valid body, once for an existing project and once for a missing one
- **THEN** both answers are the identical `role-required` denial, and no run or project state is read

#### Scenario: Bearer on login
- **WHEN** `logIn` is called with the operator bearer and no session cookie
- **THEN** the answer is 401 with reason `unauthenticated`

#### Scenario: Bearer and cookie together
- **WHEN** an operation that accepts both the operator bearer and the session cookie receives both without a CSRF header
- **THEN** the bearer authenticates the request, the cookie is ignored, and no CSRF token is required

#### Scenario: Worker credential operations
- **WHEN** a worker calls `renewWorkerCredentials` or `confirmWorkerCredentials` with its worker credential
- **THEN** the control plane authenticates the worker credential, checks no operator role, and runs the operation

## ADDED Requirements

### Requirement: Credential renewal and confirmation operations
`renewWorkerCredentials` and `confirmWorkerCredentials` SHALL run under the worker credential and answer 200 with `CredentialRenewal` and `CredentialConfirmation`; an invalid body or public key SHALL be 400, a refused bearer 401, a `conflict` 409 with its reason, an unavailable store 503, and any other failure 500.

#### Scenario: Renewal answer
- **WHEN** a worker renews a requested generation over HTTP
- **THEN** the answer is 200 with the generation, the JWT for its key, and the deadline, and carries no secret

#### Scenario: Invalid public key
- **WHEN** a renewal names a public key that is not an NKey user key
- **THEN** the answer is 400 and the worker's credentials are unchanged

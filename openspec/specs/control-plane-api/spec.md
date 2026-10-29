# control-plane-api Specification

## Purpose
The control-plane service: its composition root, the HTTP operations of the SDLC and execution contracts, the submit-task use case, and its background loops.

## Requirements

### Requirement: Operator credential
Every SDLC operation, `readTaskResult`, and the quarantine operations SHALL require the installation-owner credential as a bearer token, and SHALL answer 401 without it or with another.

#### Scenario: Wrong bearer
- **WHEN** `createRun` is called with a bearer that is not the operator credential
- **THEN** the answer is 401 with a `Failure` of code `forbidden`

### Requirement: Runtime validation
Every request body SHALL be validated against its contract schema before any use case runs, and SHALL be answered 400 when it fails or exceeds 1 MiB.

#### Scenario: Invalid body
- **WHEN** `createRun` receives a body without its binding
- **THEN** the answer is 400 and no run is created

#### Scenario: Enrollment capacity above the bound
- **WHEN** `enrollWorker` receives a capacity value above the schema's maximum
- **THEN** the answer is 400 and the enrollment token is not consumed

### Requirement: Atomic task submission
`submitTask` SHALL admit the task, use its admission, open the task, write its root lineage link and run binding, and append `sdlc.admission.used`, all in one transaction. A repeat of the same submission SHALL return the stored one, and a conflicting repeat SHALL be 409.

#### Scenario: Submitted task
- **WHEN** a planning task is submitted to a run's planning stage
- **THEN** the answer is 201 with a used admission at ownership generation 1, and the published `sdlc.admission.used` validates against its schema

#### Scenario: Implementation without gates
- **WHEN** an implementation task is submitted before its prerequisite gates passed
- **THEN** the answer is 422

### Requirement: Known workflows
`createRun` SHALL accept only a binding to a workflow of the configured registry with its digest, answering 422 otherwise, and SHALL return the stored run to a retry of the same request and 409 to another request for it.

#### Scenario: Unknown digest
- **WHEN** a run is created with a digest the registry does not hold
- **THEN** the answer is 422

### Requirement: Wire commands
Every scheduling outbox row SHALL be a wire command with `CommandMetadata`, its SDLC binding, and the payload at the protocol version the worker shares, and placement SHALL not choose a worker without a protocol version.

#### Scenario: Offer
- **WHEN** a placement commits
- **THEN** its outbox row validates against `AssignmentOfferCommand` and carries the recovery epoch

### Requirement: Publication under restore quarantine
The outbox publisher SHALL publish no row while the installation is quarantined or has no record.

#### Scenario: Quarantine lifted
- **WHEN** a task is submitted under quarantine and the quarantine is then lifted
- **THEN** its event stays unpublished until the lift and is published after it

### Requirement: Enrollment and redrive over HTTP
`enrollWorker` SHALL enroll with the single-use enrollment token as its bearer, and the redrive operation SHALL publish a quarantined message again only for the operator.

#### Scenario: Token reuse
- **WHEN** an enrollment token is used a second time
- **THEN** the answer is 401

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

### Requirement: Connection closed after each response
The control-plane API SHALL answer every request with `Connection: close` and close the connection after the response, so that no client reuses an idle connection that the server's idle timeout may close while a request is in flight.

#### Scenario: Sequential requests
- **WHEN** a client sends two requests to the API one after the other
- **THEN** each answer carries `Connection: close` and the second request arrives on a new connection

### Requirement: TLS listeners
The control plane SHALL serve the worker API over HTTPS on the installation's API certificate, and the browser endpoint over HTTPS on the operator's `TASKELITH_BROWSER_TLS_CERT` and `TASKELITH_BROWSER_TLS_KEY`, or on the API certificate when neither is set. Both SHALL refuse TLS below 1.2, and the service SHALL have no plain listener. A missing, unreadable, mismatched, or expired certificate SHALL fail the start and name its setting or file.

#### Scenario: Worker API over HTTPS
- **WHEN** a client that trusts the installation authority calls the worker API
- **THEN** the call succeeds over TLS, and a plain HTTP request on that port gets no API answer

#### Scenario: Operator certificate
- **WHEN** the browser endpoint is configured with an operator's certificate and key
- **THEN** it presents that certificate, and the worker API still presents the installation's

#### Scenario: Old protocol
- **WHEN** a client offers at most TLS 1.1
- **THEN** the handshake fails

#### Scenario: Expired certificate
- **WHEN** the API certificate has expired at start
- **THEN** the start fails with `precondition-failed` and names the certificate file

#### Scenario: Only one browser file
- **WHEN** `TASKELITH_BROWSER_TLS_CERT` is set without `TASKELITH_BROWSER_TLS_KEY`
- **THEN** the settings fail with `invalid` and name `TASKELITH_BROWSER_TLS_KEY`

### Requirement: Public installation CA
`readInstallationCa` SHALL answer without a credential with the installation CA certificate of `installation-ca.pem` in PEM, and SHALL never answer key material. The control plane SHALL read the file at start under the namespace's checks; a file that is missing or holds anything but one CA certificate SHALL fail the start with `precondition-failed` and name the file, without its content.

#### Scenario: Read without a credential
- **WHEN** a client without a bearer calls `GET /installation/ca`
- **THEN** the answer is 200 with the installation CA certificate, whose SHA-256 equals the enrollment bundle's `installationCaSha256`

#### Scenario: Key beside the certificate
- **WHEN** `installation-ca.pem` holds a PEM private-key block beside the certificate at start
- **THEN** the start fails with `precondition-failed`, names the file, and the failure holds no PEM text

### Requirement: Browser sessions
The control plane SHALL serve `readSession`, `logIn`, and `logOut` on the browser endpoint as `control-plane.openapi.json` declares them, with server-side sessions whose identifier is stored only as its hash. A successful login SHALL replace the session identifier and its CSRF token in one write. The session cookie SHALL be `__Host-taskelith-session` with `HttpOnly`, `Secure`, `SameSite=Strict`, and `Path=/`, without `Domain`.

#### Scenario: Anonymous session
- **WHEN** `readSession` is called without a valid session cookie
- **THEN** it answers 200 with an anonymous session and its CSRF token, `Cache-Control: no-store`, and a `Set-Cookie` header with exactly the cookie attributes above

#### Scenario: Login rotates the session
- **WHEN** `logIn` succeeds with the anonymous session's cookie and CSRF token
- **THEN** the answer sets a new session cookie and returns a new CSRF token, and the earlier cookie is answered 401 `unauthenticated`

#### Scenario: Wrong password
- **WHEN** `logIn` names an unknown login name or a wrong password
- **THEN** the answer is 401 with reason `login-failed` and does not say which was wrong

#### Scenario: Login name not lowercase
- **WHEN** `logIn` names a login name with an uppercase letter
- **THEN** the answer is 400 `invalid` and says that the login name must be lowercase, without the value

#### Scenario: Logout
- **WHEN** `logOut` is called with a session cookie and its CSRF token
- **THEN** the session ends, the cookie is expired, the answer is 204, and a repeat answers 401 `unauthenticated`

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

### Requirement: Per-project evidence authorization
`readEvidence` and `downloadEvidence` SHALL accept the session cookie or the operator bearer and SHALL require `project-viewer` or above on the evidence record's project, or `installation-owner`, checked before any content is read. A caller that does not pass the check SHALL get the 404 of an unknown record, with the same body for an unknown identifier as for a record of another project (execution wire contracts section 8.2).

#### Scenario: Evidence of a foreign project
- **WHEN** a principal with a role only on another project downloads evidence
- **THEN** the answer is 404 and no content is read

#### Scenario: Unknown evidence for a principal without the role
- **WHEN** a principal reads an unknown evidence identifier and a known one of a project where it holds no role
- **THEN** both answers are the same 404 with the same body, which names neither the record nor its project

#### Scenario: Evidence through a browser session
- **WHEN** a session of a `project-viewer` on the record's project reads the record
- **THEN** the session authenticates the read without a CSRF token, and an anonymous session answers 401

### Requirement: Request logs without secrets
The request log SHALL hold only the method, the operation, its path and query parameters, the status, and the failure, redacted with `@taskelith/secrets`. No log line, failure, or audit record SHALL contain a password, a session identifier, a CSRF token, or the `Cookie`, `X-CSRF-Token`, or `Authorization` header.

#### Scenario: Secrets absent from output
- **WHEN** a login fails, a CSRF check fails, and a body fails validation with a known password, session identifier, and CSRF token
- **THEN** none of those values appears in the request log, the failure bodies, or the audit trail

### Requirement: Login throttling without lockout
`logIn` SHALL throttle by login name and by source address and never lock an account. After 5 failures of a key within 15 minutes, each further attempt of that key SHALL wait a constant delay, then be verified as usual. Attempts SHALL run one at a time per key, and an address with 4 attempts waiting SHALL get 503 `unavailable` at once. These limits are provisional.

#### Scenario: Throttled, not locked
- **WHEN** five wrong passwords for a login name are followed by the right one
- **THEN** the right one logs in after the delay

#### Scenario: Parallel guessing from one address
- **WHEN** one source address sends six `logIn` requests at once
- **THEN** their passwords are verified one at a time, and the two beyond four answer 503 `unavailable` at once

### Requirement: Provisional session lifetimes
By provisional configured defaults, an authenticated session SHALL end 8 hours after its last renewal or 24 hours after its login, whichever is first, and an anonymous session 15 minutes after its start. A request SHALL renew the idle expiry at most once a minute. Anonymous sessions beyond 10 000 SHALL be purged oldest first.

#### Scenario: Idle and absolute expiry
- **WHEN** an authenticated session gets no request for 8 hours, or is used until 24 hours after its login
- **THEN** its cookie answers 401 `unauthenticated`

### Requirement: Run resources deny unknown and foreign alike
For a run or task resource found by its own identifier, a caller without the required role SHALL get the same `role-required` denial for an unknown identifier as for one of another project, before the request body is read. Only a caller that passes the check, such as an `installation-owner` on a read, SHALL learn that the resource does not exist.

#### Scenario: Unknown and foreign run
- **WHEN** a principal without a role on a run's project calls `submitTask` with an invalid body on that run and on an unknown run
- **THEN** both answers are the same 403 `role-required` body

### Requirement: Credential renewal and confirmation operations
`renewWorkerCredentials` and `confirmWorkerCredentials` SHALL run under the worker credential and answer 200 with `CredentialRenewal` and `CredentialConfirmation`; an invalid body or public key SHALL be 400, a refused bearer 401, a `conflict` 409 with its reason, an unavailable store 503, and any other failure 500.

#### Scenario: Renewal answer
- **WHEN** a worker renews a requested generation over HTTP
- **THEN** the answer is 200 with the generation, the JWT for its key, and the deadline, and carries no secret

#### Scenario: Invalid public key
- **WHEN** a renewal names a public key that is not an NKey user key
- **THEN** the answer is 400 and the worker's credentials are unchanged

### Requirement: Agent session operations served
The control plane SHALL serve the agent session operations of control-plane wire contracts section 9 with the session cookie or the operator bearer, checking the section 3 role on the path's project before the body, and SHALL answer a session or card of another project with the same 404 as an unknown one.

#### Scenario: Viewer submits a turn
- **WHEN** a `project-viewer` of the project calls `submitTurn` with a valid body
- **THEN** the answer is 403 with reason `role-required`, and no turn is recorded

#### Scenario: Owner without a project role
- **WHEN** an `installation-owner` without a role on the project reads a session and then responds to its native request
- **THEN** the read answers 200, the response 403 with reason `role-required`, and the request stays open

#### Scenario: Session of another project
- **WHEN** a member of project A reads a session of project B through a path of project A
- **THEN** the answer is the 404 that an unknown session gets

#### Scenario: Card page in one state
- **WHEN** a session is added to a card and another changes while `listAgentSessions` reads the card
- **THEN** the page lists and shows the sessions as one transaction read them

#### Scenario: Output of another project
- **WHEN** a member of project A calls `readAgentSessionOutput` for a session of project B through a path of project A
- **THEN** the answer is the 404 that an unknown session gets, and no output is read

### Requirement: Wire reasons of session refusals
The control plane SHALL answer a stopped session's turn with 422 `session-stopped`, a response to an answered request with another key with 409 `already-answered`, and a response for an attempt that is not the active bound one with 422 `attempt-not-current`.

#### Scenario: Second response with another key
- **WHEN** a request answered by one response gets a response with another idempotency key
- **THEN** the answer is 409 with reason `already-answered`, and the first response stays

### Requirement: Turn identifiers minted by the control plane
The control plane SHALL mint each turn's `TurnId` as `t` and 32 lowercase hexadecimal digits from 128 random bits, and the domain parser of a `TurnId` SHALL refuse any other form, a UUID included.

#### Scenario: Recorded turn
- **WHEN** `submitTurn` records a turn
- **THEN** its `turnId` matches `^t[0-9a-f]{32}$`

#### Scenario: UUID as a turn ID
- **WHEN** a UUID is parsed as a `TurnId`
- **THEN** it is refused as invalid

### Requirement: View position before the event stream
The agent session reads SHALL carry the view position `0`, before any event, until the event stream of G3 item 14 assigns positions.

#### Scenario: Read before item 14
- **WHEN** a client reads an agent session
- **THEN** the answer's `position` is `0`

### Requirement: Session input digest key at initialization
Installation initialization SHALL create `control-plane/session-input-digest.key` with mode `0600` through the control-plane namespace when it is missing, also on a rerun, SHALL never overwrite an existing key, and SHALL never log or output it; the control plane SHALL build the session timeline service at its start.

#### Scenario: First initialization
- **WHEN** an installation is initialized
- **THEN** the key file exists with mode `0600`, no output holds its bytes, and the control plane starts with the service

#### Scenario: Rerun of initialization
- **WHEN** initialization runs again on an installation with a key, and again after the key is lost
- **THEN** the first rerun keeps the key's bytes, and the second creates a new key with mode `0600`

#### Scenario: Existing key of the wrong size
- **WHEN** initialization finds a key of the wrong size
- **THEN** it keeps the key, and the service start still refuses it

### Requirement: Session output tail key at initialization
Installation initialization SHALL create `control-plane/session-output-tail.key` with mode `0600` through the control-plane namespace when it is missing, also on a rerun, SHALL never overwrite an existing key, and SHALL never log or output it.

#### Scenario: Rerun with a lost tail key
- **WHEN** initialization runs again on an installation with a tail key, and again after the key is lost
- **THEN** the first rerun keeps the key's bytes, and the second creates a new key with mode `0600`

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
The request log SHALL hold only the method, the operation, its path and query parameters, the status, and the failure, redacted with `@taskelith/secrets`. No log line, failure, or audit record SHALL contain a password, a session identifier, a CSRF token, an SCM integration's secret value, or the `Cookie`, `X-CSRF-Token`, or `Authorization` header.

#### Scenario: Secrets absent from output
- **WHEN** a login fails, a CSRF check fails, and a body fails validation with a known password, session identifier, and CSRF token
- **THEN** none of those values appears in the request log, the failure bodies, or the audit trail

#### Scenario: SCM secret absent from the audit trail
- **WHEN** an integration is created, updated, and has a secret replaced, each with a known secret value
- **THEN** that value appears in neither the request log nor the SCM integration audit trail

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

### Requirement: Web SPA served under /app/
The browser endpoint SHALL answer GET and HEAD of `/app` and of every path under `/app/` that no operation matches with the built SPA: the file at the path with its content type, or `index.html` for a path without a file extension. A missing file with an extension SHALL be a 404 `not-found`, never the page. Every operation SHALL be matched first; the worker endpoint SHALL serve no SPA. The request log SHALL name the operation `web-app` and no path.

#### Scenario: Screen address
- **WHEN** a browser opens `/app/sessions` or another path under `/app/` without a file extension
- **THEN** the answer is 200 with the build's `index.html` as `text/html; charset=utf-8`

#### Scenario: Missing asset
- **WHEN** a browser requests `/app/assets/index-missing.js`, a file with an extension that the build does not hold
- **THEN** the answer is 404 `not-found` as JSON, not the page

#### Scenario: Operation path
- **WHEN** a request matches an operation, or a path outside `/app/` matches none
- **THEN** the operation answers it, or the answer is the API's 404 `not-found`, and never the SPA

### Requirement: Web SPA cache headers
A file of the build under `assets/`, whose name Vite gives a content hash, SHALL be answered with `Cache-Control: public, max-age=31536000, immutable`; `index.html` and every other file SHALL be answered with `Cache-Control: no-cache`.

#### Scenario: Hashed asset
- **WHEN** a browser requests `/app/assets/index-AbC123.js`
- **THEN** the answer is `text/javascript; charset=utf-8` with `Cache-Control: public, max-age=31536000, immutable`

#### Scenario: Page
- **WHEN** a browser requests any address that answers `index.html`
- **THEN** the answer carries `Cache-Control: no-cache`

### Requirement: Web SPA content security policy
Every SPA answer, a failure included, SHALL carry a `Content-Security-Policy` with `default-src 'none'`, `script-src 'self'`, `style-src 'self'`, and `frame-ancestors 'none'`, without `unsafe-inline` or `unsafe-eval`; the page's `style-src` SHALL add a nonce of 128 random bits, fresh per answer, in place of the build's placeholder. Each SHALL also carry `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and same-origin opener and resource policies.

#### Scenario: Page nonce
- **WHEN** a browser requests the page twice
- **THEN** each answer's `style-src` names a different nonce, which the page's `csp-nonce` meta tag carries in place of the placeholder

#### Scenario: Failure headers
- **WHEN** a request under `/app/` gets a 404 or 400 from the SPA, such as for a missing asset
- **THEN** the JSON answer carries the policy and the related headers, with `Cache-Control: no-store`

#### Scenario: Inline script
- **WHEN** the control plane answers the page
- **THEN** its `script-src` is `'self'` alone, without a nonce or `unsafe-inline`, so a browser runs no inline script

### Requirement: Web SPA path confinement
The control plane SHALL answer only regular files read at start from the build, opening none through a link in its last component, and SHALL fail the start for a root that is a link or an entry found replaced. A path as sent, before URL normalization, whose decoded segments hold `.`, `..`, an inner empty segment, a separator, or NUL SHALL be a 404 `not-found` without a lookup, as SHALL a path at or below a left-out link; invalid percent-encoding SHALL be a 400 `invalid`.

#### Scenario: Traversal
- **WHEN** a request names `/app/..%2Fsecret.txt`, `/app/assets/..%2F..%2Fsecret`, or a symbolic link of the build that points outside it
- **THEN** the answer is 404 and holds neither the file outside the build nor the page

#### Scenario: Dot segment as sent
- **WHEN** a request is sent as `/app/%2e/sessions` or `/app/assets/../assets/index-AbC123.js`
- **THEN** the answer is 404 `not-found`, and the build is not looked up

#### Scenario: Below a link
- **WHEN** the build holds a symbolic link `outside` and a request names `/app/outside` or `/app/outside/sessions`
- **THEN** the answer is 404 `not-found`, not the page

#### Scenario: Entry replaced at start
- **WHEN** a file or directory of the build is replaced by a symbolic link while the start reads the build
- **THEN** the start fails with `precondition-failed` and names `TASKELITH_WEB_APP_DIR`

### Requirement: Web SPA build at start
The control plane SHALL read the build from the directory that `TASKELITH_WEB_APP_DIR` names once at start; a directory that cannot be read or has no `index.html` SHALL fail the start with `precondition-failed` and name the variable and the directory. Without the variable the browser endpoint SHALL serve no SPA, so `/app/` answers 404 `not-found`. The control-plane image SHALL set the variable to the SPA that its build stage builds.

#### Scenario: Build missing
- **WHEN** `TASKELITH_WEB_APP_DIR` names a directory without `index.html`
- **THEN** the start fails with `precondition-failed` and names `TASKELITH_WEB_APP_DIR`

#### Scenario: No build configured
- **WHEN** the control plane starts without `TASKELITH_WEB_APP_DIR`
- **THEN** `/app/` answers 404 `not-found`, and every operation answers as before

### Requirement: Project operations served
The control plane SHALL serve `listProjects`, `createProject`, `readProject`, `updateProject`, `listProjectMembers`, `assignProjectMember`, `removeProjectMember`, `readProjectDefaults`, `updateProjectDefaults`, and `readAutoMergeSetting` as `control-plane.openapi.json` declares them, with the roles of control-plane wire contracts section 3, checked before the body.

#### Scenario: Missing and existing project alike
- **WHEN** a principal that lacks the role an operation requires on a project calls it, once for an existing project and once for a missing one, the principal being no `installation-owner` on a read
- **THEN** both answers are the identical 403 `role-required` denial, and nothing is recorded

#### Scenario: Owner learns a missing project
- **WHEN** an `installation-owner` reads a project that does not exist
- **THEN** the answer is 404 `not-found`

#### Scenario: Owner without a project role
- **WHEN** an `installation-owner` without a role on a project calls `updateProject` or `updateProjectDefaults`
- **THEN** the answer is 403 `role-required` naming `project-maintainer`

### Requirement: Project creation without members
`createProject` SHALL create a project with a minted identifier, its name, its defaults at revision 1, and its auto-merge setting on at revision 1, and SHALL give no principal a role, its creator included.

#### Scenario: New project
- **WHEN** an `installation-owner` creates a project
- **THEN** the answer is 201 with revision 1, the project lists no member, its defaults have revision 1 without `changedBy`, and its auto-merge setting is enabled at revision 1

### Requirement: Project changes by compare-and-set
`updateProject` and `updateProjectDefaults` SHALL change the project only at the revision they name, increment it, and answer 409 `conflict` otherwise; a defaults change SHALL record its principal and time and apply to tasks created afterwards only.

#### Scenario: Stale revision
- **WHEN** a `project-maintainer` sends an expected revision that is not the current one
- **THEN** the answer is 409 `conflict` and nothing changes

#### Scenario: Concurrent updates
- **WHEN** two updates name the same current revision at once
- **THEN** exactly one succeeds and the other answers 409 `conflict`

### Requirement: Project members managed by the installation-owner
`assignProjectMember` SHALL replace the principal's one role on the project and answer 404 for an unknown project or principal; `removeProjectMember` SHALL answer 204 also for a principal that is no member, and 404 for an unknown project. A role change SHALL apply to the principal's next request.

#### Scenario: Removal of a non-member
- **WHEN** an `installation-owner` removes a principal that holds no role on an existing project
- **THEN** the answer is 204 and no audit event is written

### Requirement: Projects listed by membership
`listProjects` SHALL return every project to an `installation-owner` and to any other principal the projects on which it holds a role; it and `listProjectMembers` SHALL return at most 100 items in code-unit order of their identifier, with `next` while more remain.

#### Scenario: Member's list
- **WHEN** a principal with a role on one of several projects calls `listProjects`
- **THEN** the answer holds only that project

### Requirement: SCM webhook receiver served
The control plane SHALL serve `receiveScmWebhook` without a credential: it SHALL read at most 25 MiB of raw body, answering 413 beyond it before any verification and, for a declared length beyond it, before reading, read and handle at most a fixed number of deliveries at once, discards aside, pass the bytes and the lower-case headers to the receiver, and answer 202 without a body for every accepted delivery, a repeat included. Other operations SHALL keep their body limits.

#### Scenario: Oversized delivery
- **WHEN** a delivery's body exceeds 25 MiB
- **THEN** the answer is 413 and no verifier sees the delivery

#### Scenario: Concurrent deliveries
- **WHEN** more deliveries arrive at once than the receiver handles
- **THEN** the others wait, unread, until one is answered

#### Scenario: Redelivery over HTTP
- **WHEN** a signed delivery arrives twice
- **THEN** both answers are 202 and its event is recorded once

### Requirement: Identical webhook rejection
The receiver SHALL answer 401 `WebhookRejection` with one identical body for an unknown integration, an identifier that is not an `Identifier` or not valid percent-encoding, a missing signature, and a failed signature, and SHALL answer 400 `invalid` for a verified delivery that carries no event and is not an eventless one with a JSON object body.

#### Scenario: Undecodable identifier
- **WHEN** the path's integration identifier is not valid percent-encoding
- **THEN** the answer is the same 401 as for a failed signature, not 400

#### Scenario: Verified push without a repository
- **WHEN** a verified GitHub `push` delivery has no repository
- **THEN** the answer is 400 `invalid` and nothing is recorded

### Requirement: GitHub webhook composition
For GitHub integrations the control plane's composition SHALL give the receiver the decoy and the eventless rule of the GitHub plugin's descriptor, copying none of the plugin's headers or events, and verifiers over the stored integrations. The decoy SHALL do the plugin's verification work for the same headers, and only a delivery whose `x-github-event` header is `ping`, `installation`, or `installation_repositories` SHALL be eventless.

#### Scenario: Missing signature of an unknown integration
- **WHEN** a delivery without a signature names an unknown integration and the same delivery a known GitHub one
- **THEN** both compute the same number of HMACs and comparisons, none

#### Scenario: Verified ping over HTTP
- **WHEN** a verified GitHub `ping`, `installation`, or `installation_repositories` delivery has a JSON object body
- **THEN** the answer is 202 and nothing is recorded

#### Scenario: Stored integration
- **WHEN** an integration created through `createScmIntegration` receives a delivery signed with its webhook secret
- **THEN** the answer is 202, and after an update of that secret the old signature answers 401

### Requirement: Webhook request logs
A request log line of `receiveScmWebhook` SHALL hold only the allowlisted parts of wire contracts section 7, never the delivery's body or any of its headers.

#### Scenario: Logged signed delivery
- **WHEN** a signed delivery is answered
- **THEN** its log line names the operation and status, and holds no signature or payload text

### Requirement: SCM integration operations
The control plane SHALL serve `listScmIntegrations` and `readScmIntegration` to any authenticated principal, and `createScmIntegration` and `updateScmIntegration` only to an `installation-owner`, checked before the body. `createScmIntegration` SHALL answer 404 for an unregistered plugin and 400 naming an invalid origin, setting, or secret; `updateScmIntegration` SHALL answer 404 for an unknown integration and 409 for a stale revision.

#### Scenario: Concurrent updates over HTTP
- **WHEN** two `updateScmIntegration` requests at one revision arrive together
- **THEN** one answers 200, the other 409, and the revision moves once

#### Scenario: Setting refused by the document's schema
- **WHEN** a create or update body holds a secret with an empty value or a name that is not kebab-case, or a setting that is no string
- **THEN** the answer is 400 `invalid` with `details.setting` naming that setting or secret, and it quotes no value

#### Scenario: Principal without the owner role
- **WHEN** a principal without `installation-owner` creates or updates an integration
- **THEN** the answer is 403 `role-required` and nothing changes, while its list and read answer 200

### Requirement: No SCM secret in answers or logs
No response, failure, request log, or string form SHALL carry an SCM integration's secret value: a read SHALL return only `secretNames`, the names of the stored secrets.

#### Scenario: Refused secret
- **WHEN** `createScmIntegration` is refused for an invalid private key whose text holds the webhook secret
- **THEN** the 400 names `private-key`, and neither the answer nor the request log holds either value

### Requirement: SCM integration secret key at initialization
Installation initialization SHALL create `control-plane/scm-integration-secrets.key`, never the slot credential key, with mode `0600` through the control-plane namespace when it is missing, also on a rerun, and SHALL never overwrite or output it. The service SHALL refuse to start without it, naming `init`, or with a key of another size.

#### Scenario: Missing key at start
- **WHEN** the control plane starts without the SCM integration secret key
- **THEN** the start fails with `precondition-failed`, naming `scm-integration-secrets.key` and `init`

### Requirement: Event streams
The control plane SHALL serve `streamProjectEvents` and `streamInstallationEvents` as `text/event-stream` with `Cache-Control: no-store` after the role check of wire contracts section 3, and SHALL send each event of the stream's scope as a frame with its position as `id`, its type as `event`, and one `data` line valid against `ProjectEvent` or `InstallationEvent`, in position order.

#### Scenario: Event after the open
- **WHEN** a `project-viewer` streams its project's events and a change of that project commits and is numbered
- **THEN** the stream sends the change's event with its position, and no event of another scope

### Requirement: Event stream cursor
A stream SHALL resume after `Last-Event-ID`, else after `after`, else at the head; a cursor below the retention floor SHALL get a `resync` `cursor-expired`, one beyond the head `cursor-unknown`, each with status 200 and no `id`, after which the server ends the stream; only a malformed cursor SHALL answer 400.

#### Scenario: Reconnect after an event
- **WHEN** a client reconnects with `Last-Event-ID` of an event it received, and with an older `after`
- **THEN** the stream sends the retained events after that `Last-Event-ID` and then the live ones

#### Scenario: Pruned cursor
- **WHEN** a client streams after a position below the retention floor
- **THEN** it receives the `resync` frame `cursor-expired` and the stream ends

### Requirement: Event stream ends
A stream SHALL end with `stream-ended` `role-changed` when a change of its principal's roles in its project, or of its `installation-owner` role, commits after it opened, SHALL end without a frame when its login session ends, SHALL be dropped when more than 1 MiB of it is unsent, and SHALL send a keep-alive comment every 15 s.

#### Scenario: Role change
- **WHEN** a member's role in the project changes while it streams the project's events
- **THEN** the stream sends `stream-ended` with reason `role-changed` and ends

#### Scenario: Logout
- **WHEN** a browser logs out while it streams events
- **THEN** its stream ends without a frame, and a bearer's stream goes on

### Requirement: Event retention window
The control plane SHALL keep a numbered event for `TASKELITH_EVENT_RETENTION_HOURS` hours, 24 unless set to a positive whole number, SHALL prune older events by a periodic job that raises the stored retention floor, and SHALL refuse to start with another value of the setting.

#### Scenario: Default window
- **WHEN** the setting is absent
- **THEN** events numbered more than 24 hours ago are pruned and the floor rises to the highest pruned position

### Requirement: View position from the event log
The agent session reads SHALL carry as their view position the head of the event log, read before the view, so that every event at or below it is reflected in the view.

#### Scenario: Read after an event
- **WHEN** a client reads an agent session after events were numbered
- **THEN** the answer's `position` is the head of the event log when the read started

### Requirement: Board and inbox reads served
The control plane SHALL serve `readBoard`, `readTaskDetail`, `readInbox`, `readInboxCounts`, `readInstallationInbox`, and `readInstallationInboxCounts` with the roles of wire contracts section 3, each view built in one read-only `REPEATABLE READ` snapshot whose position, the event log's head, is read first in it, answering `503` when a source cannot be read and `404` for an unknown project or a run that is no card of the project.

#### Scenario: A card committed after the head
- **WHEN** a card is registered after a view's snapshot read the head
- **THEN** the view neither shows the card nor carries a position that covers its event

#### Scenario: An inbox source fails
- **WHEN** one registered inbox source cannot be read
- **THEN** the inbox and its counts answer `503`, never a partial list

#### Scenario: A viewer reads the board
- **WHEN** a project viewer without the operator role reads the board
- **THEN** the board answers `200` with `callerMayAct` false

### Requirement: Card events projected after each change
A projector SHALL replace each project, worker, or fleet touch with a touch of each card it names, then consume the card touches in `SERIALIZABLE` transactions of at most 100 touches each, append `card-changed` with the card the board would return when the card or its task detail differs from its last projection, a fleet obstacle's observation time aside, and `board-changed` for each project whose workers online changed, and SHALL run in each numbering pass before it numbers.

#### Scenario: An unchanged card is touched again
- **WHEN** a touched card projects to the same record as its last event
- **THEN** no `card-changed` is appended

#### Scenario: Only the task detail changes
- **WHEN** a touched card's own record is unchanged but its task detail changed, such as a gate of a later stage
- **THEN** one `card-changed` with that unchanged card is appended

#### Scenario: A worker comes online
- **WHEN** a worker's change raises the workers online
- **THEN** each project gets one `board-changed` with the new count

#### Scenario: A fleet change over more cards than a batch
- **WHEN** a fleet touch names more cards than a batch holds and the process dies after the first batch commits
- **THEN** the restart appends the event of each remaining card once, and of no card twice

### Requirement: Unreadable card isolated
A card whose view cannot be read SHALL append nothing and keep a pending touch, while the other cards of its batch project; the numbering pass SHALL log only the run identifiers and the count of such cards, and the card SHALL project in a later pass once it can be read.

#### Scenario: A card without its run
- **WHEN** a pass projects two touched cards and one has no stored run
- **THEN** the other card's `card-changed` is appended, the first keeps its touch, and once its run is stored a later pass appends its `card-changed`

### Requirement: Task detail before traceability
Until task intake records requirement links, the task detail SHALL return `traceability` empty.

#### Scenario: A task detail read before intake
- **WHEN** a task detail of a card with a task is read
- **THEN** its `traceability` is empty

### Requirement: Task detail in admission order
The task detail SHALL list a card's tasks in the order in which they were admitted, each delegated child under its parent in its own admission order. The order SHALL be total and stable; it need not be the commit order of concurrent admissions.

#### Scenario: A child admitted after a later task
- **WHEN** task `b` of a card is admitted, then task `a`, then a child of `a`, then a child of `b`
- **THEN** the detail lists `b`, the child of `b`, `a`, and the child of `a`

### Requirement: Inbox answers served
The control plane SHALL serve `answerInboxItem` and `answerInstallationInboxItem`, checking the operation's role and then the item's `answerableBy` role through `Access` before the body, and SHALL check the answer's key, call the item's source, and record the key with a keyed digest of the unredacted answer and its responder in one `SERIALIZABLE` transaction.

#### Scenario: Two concurrent identical answers
- **WHEN** two requests with the same key and answer reach an open item at once
- **THEN** one answer and one key are recorded, and both requests return the same resolved item

#### Scenario: Two concurrent different answers
- **WHEN** two different answers reach an open item at once
- **THEN** one commits, and the other answers 409 `idempotency-key-reused` with the same key or `already-answered` with another

#### Scenario: Another principal repeats a key
- **WHEN** another principal repeats the key of a resolved item with the same answer
- **THEN** the answer is 409 `idempotency-key-reused`, and that principal never receives the first principal's outcome

#### Scenario: A replay without the role or scope
- **WHEN** a principal who answered an item repeats its key and answer after losing the item's role, or through another project's inbox
- **THEN** the answer is refused 403 or 404 as a stranger's is, before any key is read, and never returns the stored outcome

#### Scenario: A refused answer
- **WHEN** a source refuses an answer with 422
- **THEN** no key is recorded and nothing else changes

### Requirement: Reconciliation answers applied
Resolving an unknown execution SHALL end its attempt as operator-resolved and release its held reservation, and every reconciliation answer SHALL record the resolved item and publish `inbox-item-changed`, in the answer's transaction, so the item leaves the inbox and its counts and its card is touched.

#### Scenario: An unknown execution is resolved
- **WHEN** a project-maintainer answers an unknown execution's item with `resolve-execution`
- **THEN** its attempt is operator-resolved, its reservation released, its card touched, and the inbox and its counts no longer hold it

#### Scenario: A terminal fact came first
- **WHEN** an unknown execution's terminal fact arrived before the answer
- **THEN** the item is closed, and the answer is 422 `item-closed`

### Requirement: Reconciliation item events
The card projector SHALL publish `inbox-item-changed` for a reconciliation item when it opens or closes, or otherwise changes, once per change, in the projection's transaction, comparing it with its last published projection; a resolved item SHALL be published by its answer alone. A closed item SHALL keep the generation of its execution's grant and the time it first closed.

#### Scenario: An unknown execution opens and closes
- **WHEN** a task's execution is reported uncertain, and later its terminal fact arrives
- **THEN** the project's stream gets the item open once, then closed once

#### Scenario: An unrecorded process
- **WHEN** a worker's unrecorded process is recorded
- **THEN** the installation stream gets its item open once

#### Scenario: A closed item's task changes
- **WHEN** a closed item's task changes or is re-admitted later
- **THEN** the item keeps its subject's generation and its closing time

### Requirement: Reconciliation items listed
The reconciliation source SHALL list an unknown execution only through its task's registered card, in the card's project inbox, and every worker's unrecorded process that no answer acknowledged in the installation inbox.

#### Scenario: No card registered yet
- **WHEN** an unknown execution's task belongs to no registered card, as before item 25 registers cards
- **THEN** no project inbox lists its item, while the installation inbox lists the unrecorded processes

### Requirement: Answer before the body ends
The control plane SHALL write a JSON, binary, or empty answer that it gives before its request's body ended, such as a 413 or a 401 before an upload's body, with `Connection: close`, then discard the rest of that body unbuffered. It SHALL close the connection gracefully when the body ends, and by force once more than 32 MiB were discarded or 10 seconds passed since the answer, sent or not. A client that ends its body within both bounds and reads gets the answer.

#### Scenario: Oversized delivery written whole
- **WHEN** a sender writes a whole delivery of 25 MiB and one byte, declared or chunked, within 10 seconds and only then reads
- **THEN** it reads the 413 with reason `body-too-large` and the connection closes gracefully

#### Scenario: Byte bound
- **WHEN** more than 32 MiB of the body follow the answer
- **THEN** the server stops reading and closes the connection by force

#### Scenario: Time bound
- **WHEN** 10 seconds pass after the answer and the connection is still open, also with the body ended and the answer unread
- **THEN** the server closes the connection by force

### Requirement: Bounded discards
The control plane SHALL discard the bodies of at most a fixed number of early answers at once, apart from the body slots of uploads and signed bodies. An early answer beyond that number SHALL close its connection at once, as without a discard; no request SHALL wait for a discard, and a closed connection SHALL free its place.

#### Scenario: Discards saturated
- **WHEN** every discard place is taken and another early answer is given
- **THEN** that answer closes its connection at once

#### Scenario: Delivery during discards
- **WHEN** every discard place is taken and a valid signed delivery arrives
- **THEN** it is read, verified, and answered 202 as usual

### Requirement: Repository binding operations served
The control plane SHALL serve `readRepositoryBinding` and `bindRepository` as `control-plane.openapi.json` declares them, with the roles of wire contracts section 3 checked before the body: a read needs a project role or `installation-owner`, and a bind needs `project-maintainer`. A read SHALL return the binding as stored, with no re-check, and 404 for an unbound project.

#### Scenario: Refusals before the body
- **WHEN** a request has no credential, a principal without the required role calls either operation for an existing or a missing project, or a browser binds without its CSRF header
- **THEN** the answers are 401, the identical 403 `role-required`, and 403 `csrf-token-invalid`, and nothing is stored

#### Scenario: Owner without the maintainer role
- **WHEN** an `installation-owner` without a role on the project binds it
- **THEN** the answer is 403 `role-required` naming `project-maintainer`, and a read by that owner answers 200 or 404

### Requirement: Repository binding by compare-and-set
A first bind SHALL name no expected revision and fail with 409 on a bound project; a later bind SHALL name the current revision and fail with 409 when it moved. Any field MAY change. A bind at the current revision that changes nothing SHALL answer 200 and keep the revision.

#### Scenario: Same binding again
- **WHEN** a maintainer sends the stored binding again with its current revision
- **THEN** the answer is 200 with that binding at the same revision

#### Scenario: Stale revision
- **WHEN** a bind names a revision that another bind already moved
- **THEN** the answer is 409 and the binding is unchanged

### Requirement: Remote URL resolution failures
`bindRepository` SHALL resolve the remote URL through the integration's plugin and answer: 404 for an unknown project or integration; 503 for an integration whose plugin is not registered or cannot be built, or a resolver `unavailable`; 422 `repository-not-visible` for `not-found`; 422 `integration-credential-refused` for `forbidden`; 400 for `invalid`; and 500 for any other code or a resolved value that is not a `RemoteUrl` of the requested repository.

#### Scenario: Repository the plugin cannot see
- **WHEN** the plugin's resolver fails with `not-found`
- **THEN** the answer is 422 `precondition-failed` with reason `repository-not-visible`, never 500, and nothing is stored

#### Scenario: Malformed resolved URL
- **WHEN** the plugin resolves a remote URL with user information
- **THEN** the answer is 500 and nothing is stored

#### Scenario: Unusable stored configuration
- **WHEN** the integration's plugin refuses to build a provider from the stored configuration
- **THEN** the answer is 503 with reason `integration-configuration-unusable`, quoting no plugin message, and nothing is stored

#### Scenario: Plugin envelope that throws
- **WHEN** reading the plugin's result envelope throws, or the envelope breaks the kernel `Result` shape
- **THEN** the answer is 500 without the thrown message, which no log record carries either

### Requirement: Binding against a current resolution
The resolver call SHALL run before and outside the store's transaction. Inside it, the store SHALL check that the integration still exists at the revision the service resolved against, and otherwise fail with 409, so that no binding is stored against a stale resolution. The merge method SHALL be one that the plugin's capabilities declare.

#### Scenario: Integration changed during the resolution
- **WHEN** the integration's revision moves after the resolver answered and before the binding is stored
- **THEN** the answer is 409 and the project's binding is unchanged

### Requirement: Audited SCM integration commands
`createScmIntegration` and `updateScmIntegration` SHALL audit each change they commit with the caller's principal as the actor and `control-plane API <operationId>` as the reason; no system actor exists. A refused or failed command, 400, 403, 404, or 409, SHALL write no audit row.

#### Scenario: Refused update
- **WHEN** an update is refused with 400, 403, 404, or 409
- **THEN** the audit trail holds no row for it

### Requirement: Runs of existing projects
`createRun` SHALL create a run only for a project that exists, which `RunService` checks through its `ProjectDirectory` port, and SHALL answer 404 `not-found` for another project, after the role check and before the workflow check that answers 422. A project without a repository binding SHALL get a run; item 21's per-run credential issue re-checks the binding.

#### Scenario: Run of an unknown project
- **WHEN** `RunService` creates a run of a known workflow for a project identifier that names no project
- **THEN** it fails with `not-found`, which `createRun` answers 404, and no run is stored

#### Scenario: Run of an unbound project
- **WHEN** a `project-operator` creates a run of a project that has no repository binding
- **THEN** the answer is 201 with the run

### Requirement: Roles of the run operations
`createRun` and `submitTask` SHALL require `project-operator` or above on the run's project, with no pass for an `installation-owner`; `readAdmission` and `readTaskResult` SHALL require `project-viewer` or above, or `installation-owner`. A role refusal SHALL answer 403 `AccessDenial` with reason `role-required` and its `requiredRole`; a missing or wrong bearer SHALL stay 401.

#### Scenario: Owner without a project role
- **WHEN** the operator bearer, whose owner holds no role on the project, calls `createRun` or `submitTask`
- **THEN** the answer is 403 `role-required` naming `project-operator`, and nothing is created

#### Scenario: Owner reads a run's results
- **WHEN** the operator bearer, whose owner holds no role on the run's project, reads an admission or a task result of the run
- **THEN** the answer is 200

### Requirement: Workers and enrollment token operations served
The control plane SHALL serve `listWorkers`, `listEnrollmentTokens`, `issueEnrollmentToken`, `revokeEnrollmentToken`, and `rotateEnrollmentToken` as `control-plane.openapi.json` declares them, for an `installation-owner` checked before the body. `listWorkers` SHALL return the admission view with every self-check detail redacted again, and 503 without partial data when a source cannot be read. The token's secret SHALL appear only in the 201 of issue and rotate, with `Cache-Control: no-store`.

#### Scenario: Secret revealed once
- **WHEN** an `installation-owner` issues or rotates a token
- **THEN** the 201 carries the token's record and its secret with `Cache-Control: no-store`, and no list, failure, or log record carries the secret

#### Scenario: Secret-shaped host name
- **WHEN** a worker's host name or a token constraint's host name has a known secret shape
- **THEN** every HTTP answer carries it redacted, the stored constraint still matches the host, and only the `secret` of a 201 is kept

#### Scenario: Principal without the owner role
- **WHEN** a principal that is no `installation-owner` calls any of the five operations
- **THEN** the answer is 403 `role-required` naming `installation-owner`, and nothing is recorded

#### Scenario: Unreadable view source
- **WHEN** a worker's record cannot be read while the view is built
- **THEN** `listWorkers` answers 503 with no worker

### Requirement: Enrollment token command refusals
`revokeEnrollmentToken` SHALL answer 204 for a pending, revoked, or expired token, 404 for an unknown one, 422 `token-used` for a used one, and 422 `token-rotated` with `details.replacementTokenId` for a rotated one, checked before expiry. `rotateEnrollmentToken` SHALL replace a pending token by one with its constraints and a new TTL in one transaction and SHALL answer 404 for an unknown token and 422 `token-not-pending` for a used, revoked, or expired one. Both SHALL decide under the row lock.

#### Scenario: Revoke a rotated token
- **WHEN** an owner revokes a token that a rotation replaced, after the old token expired
- **THEN** the answer is 422 `token-rotated` naming the replacement, which stays listed while pending

#### Scenario: Rotate twice
- **WHEN** an owner rotates a token and then rotates the same token again
- **THEN** the first answer is 201 with a new identifier and the same constraints, the old token is no longer listed, and the second answer is 422 `token-not-pending`

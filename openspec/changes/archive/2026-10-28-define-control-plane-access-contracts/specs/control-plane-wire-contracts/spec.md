## Purpose

Define the contract-first control-plane access API of G3 item 9a: an OpenAPI 3.1 document for login and sessions, project setup, the workers view, enrollment tokens, account slots, SCM integrations, and the webhook receiver, with its security schemes, failures, roles, and secret handling, before items 10 to 15 implement it.

## ADDED Requirements

### Requirement: Control-plane document
`@taskelith/contracts` SHALL hold `documents/control-plane.openapi.json` (OpenAPI 3.1.0) with a semantic `info.version`, starting at 0.1.0, and the build SHALL generate its types and validators with the other documents'. The rules that its schemas cannot express SHALL be stated in `docs/contracts/control-plane-wire-contracts.md`. A breaking change SHALL need a higher minor version while the major version is 0.

#### Scenario: Document generated
- **WHEN** the build generates the contract types
- **THEN** they include every schema and operation of the control-plane document

#### Scenario: Shared schema reused
- **WHEN** the control-plane document defines a schema whose name another document defines
- **THEN** both definitions are identical

### Requirement: Browser session and CSRF schemes
The document SHALL define `browserSession`, a cookie under the `__Host-` prefix that is `HttpOnly`, `Secure`, and `SameSite=Strict`; `csrfToken`, the `X-CSRF-Token` header; and the other documents' `operatorToken`. Every operation other than GET, except the webhook receiver, SHALL accept the cookie together with the CSRF header, every such operation other than `logIn` and `logOut` SHALL also accept the operator bearer alone, and none SHALL accept another credential.

#### Scenario: Mutation without the CSRF header
- **WHEN** a request authenticated by the session cookie changes state without the session's CSRF token
- **THEN** it is refused with 403 and reason `csrf-token-invalid`, and nothing takes effect

#### Scenario: Mutation with the operator bearer
- **WHEN** the CLI sends a mutation that declares the operator bearer, with that bearer and no CSRF header
- **THEN** the request is authenticated as the bearer's principal

### Requirement: Login session
`readSession` SHALL need no credential and, when no valid session is presented, SHALL start an anonymous server-side session and return its CSRF token. `logIn` SHALL need that session's cookie and token, and on success SHALL give the session a new identifier and a new CSRF token. `logOut` SHALL end the session.

#### Scenario: Session fixation
- **WHEN** a login succeeds on an anonymous session
- **THEN** the session identifier and CSRF token from before the login no longer authenticate

#### Scenario: Wrong password
- **WHEN** a login name and password do not match
- **THEN** the answer is 401 with reason `login-failed` and does not say which is wrong

### Requirement: Access failures
Authentication, CSRF, and authorization failures SHALL be distinct kernel failures with code `forbidden`: 401 `AuthenticationFailure` (`unauthenticated` or `login-failed`), except the webhook receiver's 401 `WebhookRejection` (`signature-invalid`), 403 `CsrfRejection` (`csrf-token-invalid`), and 403 `AccessDenial` (`role-required`). An operation with a session or bearer requirement SHALL authenticate, then check the CSRF token, then the role, before it reads the body.

#### Scenario: CSRF rejection is not an access denial
- **WHEN** a body with reason `csrf-token-invalid` is checked against `AccessDenial`
- **THEN** it is invalid, and it is valid as a `CsrfRejection`

### Requirement: Operation roles
Each operation SHALL require the role that `docs/contracts/control-plane-wire-contracts.md` section 3 names: `installation-owner` for creating projects, assigning and removing project members, the workers view, enrollment tokens, account slots, and SCM integration changes; `project-maintainer` for project changes, defaults, auto-merge, and the repository binding; and `project-viewer` or above, or `installation-owner`, for a project's reads.

#### Scenario: Maintainer assigns a member
- **WHEN** a `project-maintainer` without `installation-owner` assigns a role on its project
- **THEN** the answer is 403 with reason `role-required`

### Requirement: Project setup operations
The document SHALL define creating, reading, listing, and renaming projects, assigning and removing a principal's one role on a project, the project defaults, the auto-merge setting, and the repository binding. `updateProject`, `updateProjectDefaults`, `updateAutoMergeSetting`, and `bindRepository` on a bound project SHALL name the revision they read and fail with 409 `conflict` when it moved. A first binding and a member assignment or removal SHALL name none.

#### Scenario: Concurrent default changes
- **WHEN** two maintainers replace a project's defaults from the same revision
- **THEN** one succeeds and the other fails with 409

#### Scenario: Concurrent member assignments
- **WHEN** two installation owners assign different roles to the same principal on one project
- **THEN** both succeed and the role of the assignment serialized last stays

### Requirement: Remote origin of a binding
An integration's allowed origin, https with a host and an optional port, SHALL be set only by an `installation-owner` and stored with a lower-case host and an explicit port, 443 by default. `bindRepository` SHALL refuse with 422 a remote URL that is not HTTPS, holds user information, a query, or a fragment, or whose origin, normalized the same way, is not that origin.

#### Scenario: Remote URL outside the integration's origin
- **WHEN** a maintainer binds a remote URL whose host is not that of the integration's allowed origin
- **THEN** the answer is 422 with reason `remote-origin-mismatch` and the binding is unchanged

### Requirement: Remote origin at credential issue
Each issue or re-delivery of a per-run SCM credential SHALL first re-check the bound remote URL against the integration's current allowed origin, so that narrowing the origin covers existing bindings. On a mismatch the control plane SHALL issue no credential and record the reason `remote-origin-mismatch`.

#### Scenario: Credential issue after the origin changes
- **WHEN** an installation owner changes an integration's allowed origin so that a bound remote URL lies outside it, and a run of that project then needs its per-run SCM credential
- **THEN** the control plane issues no credential and records the reason `remote-origin-mismatch`

### Requirement: Workers view operation
`listWorkers` SHALL return the worker admission view: every enrolled worker that is not revoked, in identifier order, with its host, enrollment time, admission state, last report time, and stored self-check results, and no credential or credential hash. When a source cannot be read it SHALL answer 503 with no partial data.

#### Scenario: Credential field in the view
- **WHEN** a workers view entry carries a credential generation
- **THEN** the entry is invalid

### Requirement: Enrollment token operations
The document SHALL define listing pending enrollment tokens without their secrets, issuing a token, rotating a pending token into a new one with its constraints, and revoking a pending token. Only the 201 response of issuing or rotating SHALL carry the token's secret. A rotation or revocation SHALL serialize with a redemption of the same token, so that exactly one of them succeeds.

#### Scenario: Revocation races a redemption
- **WHEN** a token is revoked while a worker redeems it
- **THEN** either the worker is enrolled and the revocation fails with 422, or the revocation succeeds and the redemption fails with `token-invalid`

### Requirement: Account slot operations
The document SHALL define listing, adding, changing, revoking, reinstating, and removing account slots, and rotating a slot's credential; changing, revoking, reinstating, removing, and rotating SHALL compare-and-set the slot's revision. A slot credential SHALL be write-only. A project member's view of its pools SHALL say whether a slot also serves other projects without naming them.

#### Scenario: Slot in a project's view
- **WHEN** a slot serves the project and another project
- **THEN** the project's view shows it as shared and names neither its allowed projects nor its credential

### Requirement: SCM integration setup
The document SHALL define listing, reading, creating, and changing SCM integrations, each with an SCM plugin, a label, an allowed origin, plugin-defined settings, and plugin-defined write-only secrets. A change SHALL compare-and-set the integration's revision. A response SHALL name the stored secrets and never carry their values, and no schema SHALL name an SCM.

#### Scenario: Secrets in a response
- **WHEN** an integration record carries its secrets' values
- **THEN** the record is invalid

### Requirement: Webhook receiver
`receiveScmWebhook` SHALL need no session, CSRF token, or operator credential. It SHALL read at most its limit of raw bytes of any media type, then have the integration's plugin verify the signature over those exact bytes, and only then read the payload. An unknown integration and a failed verification SHALL answer the same 401; a verified delivery and a repeat of a recorded one SHALL answer 202.

#### Scenario: Unsigned delivery
- **WHEN** a delivery arrives without a valid signature
- **THEN** the answer is 401 `WebhookRejection` and nothing is recorded

### Requirement: Secrets in responses
No response schema SHALL reach a `writeOnly` value: a password, a slot credential, or SCM secrets. Besides a CSRF token, a new enrollment token's secret SHALL be the only secret in a response body; a response with either SHALL send `Cache-Control: no-store`. The session identifier SHALL travel only in `Set-Cookie`. A request log SHALL hold only allowlisted parts, never a body with a `writeOnly` value or the `Cookie`, `X-CSRF-Token`, or `Authorization` header.

#### Scenario: Write-only value in a response
- **WHEN** any operation's response schema reaches a schema marked `writeOnly`
- **THEN** the contract tests fail

#### Scenario: Logged login request
- **WHEN** the control plane logs a `logIn` request
- **THEN** the log holds neither the password nor the `Cookie` or `X-CSRF-Token` header

### Requirement: Identifiers and pages
An identifier that the control plane mints for a project, principal, enrollment token, slot, or SCM integration SHALL be one lowercase letter and 32 lowercase hexadecimal digits from 128 random bits; on the wire it SHALL be an `Identifier`. Every list other than `listWorkers`, which returns one unpaged snapshot, SHALL return at most 100 items in identifier order and a `next` identifier while more remain.

#### Scenario: Next page
- **WHEN** a list other than `listWorkers` has more than 100 items
- **THEN** the first page returns 100 and a `next` identifier that, passed as `after`, starts the next page

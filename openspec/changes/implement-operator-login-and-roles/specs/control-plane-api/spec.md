## ADDED Requirements

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
For every operation with a session or bearer requirement, the control plane SHALL authenticate, then check the CSRF header on a session-authenticated operation other than GET, then check the caller's role through the `Access` module, and only then read the request body. `createRun`, whose project is in its body, SHALL validate the body against its schema alone first and read no state before the role check. The bearer SHALL be refused on `logIn` and `logOut`.

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

### Requirement: Per-project evidence authorization
`readEvidence` and `downloadEvidence` SHALL require `project-viewer` or above on the evidence record's project, or `installation-owner`, checked before any content is read. A caller that does not pass the check SHALL get the same 403 `role-required` answer for an unknown evidence identifier as for a known one, with `details.requiredRole` naming the role.

#### Scenario: Evidence of a foreign project
- **WHEN** a principal with a role only on another project downloads evidence
- **THEN** the answer is 403 with reason `role-required` and no content is read

#### Scenario: Unknown evidence for a principal without the role
- **WHEN** a principal that is not `installation-owner` reads an unknown evidence identifier and a known one of a project where it holds no role
- **THEN** both answers are the same 403 with reason `role-required`, not 404

### Requirement: Request logs without secrets
The request log SHALL hold only the method, the operation, its path and query parameters, the status, and the failure, redacted with `@taskelith/secrets`. No log line, failure, or audit record SHALL contain a password, a session identifier, a CSRF token, or the `Cookie`, `X-CSRF-Token`, or `Authorization` header.

#### Scenario: Secrets absent from output
- **WHEN** a login fails, a CSRF check fails, and a body fails validation with a known password, session identifier, and CSRF token
- **THEN** none of those values appears in the request log, the failure bodies, or the audit trail

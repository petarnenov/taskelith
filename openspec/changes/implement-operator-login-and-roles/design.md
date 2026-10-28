## Context

G3 item 10 ([G3 work plan](/docs/g3-plan.md), row 10, decision D2 (a)) implements the `Access` side of sub-change 9a: the security schemes and failures of [control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) section 2, the role table of section 3, and the secret handling of section 7, which `packages/contracts/documents/control-plane.openapi.json` 0.1.0 declares. Section 9 there leaves to item 10 the `Access` adapter, principal administration, the session lifetime, the password policy, the hashing, and per-project evidence download.

Today `@taskelith/access` holds only the operator credential: `OperatorCredentialService` issues the bootstrap credential (`bootstrap`, generation 1), resets it by an audited administrative command, and answers `authenticate(secret)` with no principal (`packages/modules/access/src/application/operator-credential-service.ts`). The API server authenticates a route by one `SecurityScheme` (`apps/control-plane/src/api/routes.ts`), and every operator route of the SDLC and execution documents, `downloadEvidence` included, is granted to that one credential. Both TLS listeners, the worker API and the browser endpoint, serve one request handler (`apps/control-plane/src/composition/control-plane.ts`, `createTlsApiServer` for each).

**Goals.** Password login with server-side sessions in PostgreSQL, cookie and CSRF protection exactly as 9a declares them, the trust model's roles ([trust model](/docs/trust-model.md#3-project-scoped-authorization-roles) section 3) checked behind the `Access` port before every mutation and query the control plane serves, the first `installation-owner` created once from the G2 bootstrap credential and audited, per-project authorization of `readEvidence` and `downloadEvidence`, and an approver port.

**Non-goals.** OpenID Connect (a later adapter behind the same port), project persistence and the member, project, and settings handlers of section 4 (item 11 and later), the SPA (item 28), the UI event stream (item 14), a decision council or any non-human principal (ADR 0014), and any contract document change. The evidence retirement entry is deferred: its wire operation belongs to 9b to 9d, not 9a ([wire contracts](/docs/contracts/control-plane-wire-contracts.md) section 9), and is built only after that sub-change lands in `dev`.

## Sources

- Argon2id: item 1 (`qualify-g3-dependencies`) registered the built-in **`crypto.argon2` of Node 24.22.1 (OpenSSL 3.5.9)**, argon2id, status `candidate`, "Needs a PHC encoder in the `Access` adapter (item 10)" (`docs/dependencies.md:142`). Its evaluation recommends the OWASP minimum m=19456 KiB, t=2, p=1, a Taskelith PHC encoder and parser, verification by `timingSafeEqual`, a rehash when stored parameters fall below the current ones, and a start check that fails clearly without `crypto.argon2` (`docs/g3-dependencies.md:66`); it exercised the RFC 9106 argon2id vector under 24.22.1 on macOS x86_64 and Ubuntu 24.04 (`docs/g3-dependencies.md:58`). Fallback `@node-rs/argon2@2.2.2` (`docs/g3-dependencies.md:59` and `:67`). The pinned Node is 24.22.1 (`.nvmrc`), so the hash needs no new package.
- Sessions: opaque `randomBytes(32)` identifiers stored as SHA-256 and compared with `timingSafeEqual`, as `NodeSecrets` does, with `cookie@2.0.1` for parsing and serialization (`docs/g3-dependencies.md:69`; `docs/dependencies.md:144`, `candidate`).
- Wire: [control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) sections 2, 3, 6, 7, and 9; the `browserSession`, `csrfToken`, and `operatorToken` schemes and the `AuthenticationFailure`, `CsrfRejection`, `AccessDenial`, `SessionState`, `LoginRequest`, `Password`, `LoginName`, and `Principal` schemas of `control-plane.openapi.json`; `readEvidence` and `downloadEvidence` of `execution.openapi.json` 0.5.0, whose `EvidenceRecord` names its `projectId`.
- Roles: [trust model](/docs/trust-model.md#3-project-scoped-authorization-roles) section 3; [product ports](/docs/contracts/product-ports.md) section 2, rules 1 and 8.
- UI: the Mantine proof of concept, the binding UI reference ([ADR 0011](/docs/decisions/0011-mantine-ui-proof-of-concept.md); `docs/ui-poc/`), section "Proof of concept conformance" below.

## Decisions

### 1. Module shape

`@taskelith/access` stays the one module that owns identity and authorization. New ports, each with a conformance suite in `src/ports/` like `OPERATOR_CREDENTIALS_CONFORMANCE` and an in-memory adapter in `src/adapters/`:

- `Principals`: create, find by identifier or login name, set the password hash, and the one installation-role holder bound to the operator credential.
- `ProjectRoles`: the role of a principal on a project, assign (replace), remove, and the projects on which a principal holds a role.
- `Sessions`: start anonymous, authenticate (rotate identifier and CSRF token in one write), touch, end, and purge expired.
- `PasswordHasher`: `hash(password)`, `verify(password, stored)` answering match and whether a rehash is due.
- `AccessAudit`: an append-only trail of principal, role, and owner events.
- `Approvers`: decision 10.

Application services: `SessionService` (`readSession`, `logIn`, `logOut`), `AuthorizationService` (decision 6), `OwnerBootstrapService` (decision 7), and `PrincipalAdministration` (decision 8). Domain: `Principal` (with a `kind`, decision 10), `ProjectRole`, `InstallationRole`, the ordered role ranks, `Session`, and `PasswordPolicy`. The module imports no Node API; random values come through the existing `Secrets` port and time through `Clock`.

### 2. Password hashing

`Argon2idPasswordHasher` in `@taskelith/secrets` (`packages/adapters/secrets`), beside `NodeSecrets`, because the module stays free of `node:crypto` and the adapter package already owns the random source and constant-time comparison. Item 1 says "in the `Access` adapter"; this is the adapter side of the `Access` port, and a reviewer may ask for a separate package instead (coordinator question Q9).

- Parameters: argon2id, m=19456 KiB, t=2, p=1, 16-byte random salt, 32-byte tag, from one constant `ARGON2ID_PARAMETERS`.
- Stored form: the PHC string `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<tag>`, base64 without padding. A small codec formats and parses it and refuses anything else with `invalid`; it implements no cryptography, only parameter and byte formatting, and is tested to full coverage against the RFC 9106 section 5.3 vector and hostile inputs (missing fields, extra fields, oversize parameters, wrong version), as item 1 requires its reviewer to check against architecture section 7.
- Verification recomputes the tag with the stored parameters and compares with `timingSafeEqual`; a stored parameter set weaker than the current one answers "rehash due", and `logIn` replaces the hash in the same transaction as the session change.
- Start check: the control plane and the administrative entry fail with `precondition-failed` and the message `crypto.argon2 is not available; Node 24.7.0 or later with OpenSSL 3.2 or later is required` when the function is missing.
- Cost bound: hashing runs through the asynchronous `crypto.argon2` on the libuv pool behind a semaphore of at most two concurrent hashes, so a flood of logins cannot exhaust memory (19 MiB each); a waiting login beyond a queue of 32 answers 503 `unavailable`.

### 3. Password policy

Length 15 to 1024 characters (contract maximum, `Password.maxLength`), counted in Unicode code points after NFC normalization, no composition rules, no expiry, and a refusal of a password equal to the login name. Proposal after NIST SP 800-63B revision 4 for single-factor passwords; coordinator question Q7. The policy applies where a password is set (decision 8), never at login, so a login with a shorter password fails as `login-failed` like any wrong one.

### 4. Sessions and cookies

- **Identifier.** 256 random bits from `Secrets`, base64url, sent only in `Set-Cookie`; stored only as its SHA-256, so a database read reveals no usable identifier. Lookup by hash, then `timingSafeEqual` on the hash, as `NodeSecrets` does.
- **CSRF token.** 256 random bits, base64url, 43 characters (`CsrfToken`), a new one per session and per login. It must be returned by every `readSession` of its session, so it is stored as is; it authenticates nothing without the cookie (section 7). The comparison with the `X-CSRF-Token` header is constant time over equal-length buffers; a header of another length fails before the comparison.
- **Cookie.** `__Host-taskelith-session=<id>; Path=/; Secure; HttpOnly; SameSite=Strict`, no `Domain`, no `Max-Age` (a browser-session cookie; the server-side expiry governs). `logOut` and an ended session answer with the same cookie, an empty value, and `Max-Age=0`. Serialization and parsing with `cookie@2.0.1` (`stringifySetCookie`, `parseCookie`), coordinator question Q9; a request with two cookies of that name is unauthenticated.
- **Lifetime.** Proposal, coordinator question Q6: an authenticated session ends after 8 hours without a request (idle) and 24 hours after login (absolute); an anonymous session ends 15 minutes after its start. `expiresAt` in `AuthenticatedSession` is the earlier of the two. A request renews the idle expiry, written at most once a minute per session. Expired rows are purged by a background loop that the control plane already runs for its other timers, in batches.
- **Login.** `logIn` needs the anonymous session's cookie and CSRF token; on success it writes, in one transaction, the session's new identifier hash, a new CSRF token, the principal, and the expiries, so the identifier known before the login is worthless after it (section 2, "Sessions"). A login on an already authenticated session also rotates it. The answer has `Set-Cookie` and `Cache-Control: no-store`.
- **Logout.** Ends the session (sets `ended_at`), expires the cookie, answers 204; a repeat answers 401 `unauthenticated`. It ends only this browser session, as the proof of concept states.
- **Anonymous session flooding.** `readSession` without a cookie writes a row; rows are bounded by the 15-minute expiry, the purge loop, and a cap of anonymous sessions per installation (proposal 10 000) beyond which the oldest anonymous ones are purged first. Coordinator question Q6.
- **Password change and principal disablement** end every other session of the principal in the same transaction.

### 5. Request authentication order

The route table gains per-operation alternatives that mirror the document's `security` arrays: `session+csrf` or `bearer` for 9a mutations, `session` or `bearer` for 9a reads, `session+csrf` only for `logIn` and `logOut`, `optional-session` for `readSession`, and the existing schemes unchanged for the SDLC and execution documents. A test derives the alternatives of every 9a route from the document, so the table cannot drift from it.

For every request the server, in this order and before it reads the body: (1) authenticates, (2) checks the CSRF header when the session authenticated a non-GET operation, (3) asks `AuthorizationService` for the role, (4) reads and validates the body. Failures, as section 2's table: 401 `AuthenticationFailure` `unauthenticated` (no valid cookie or bearer, an ended or expired session, a bearer that is not the current operator credential, a bearer on a session operation), 401 `login-failed`, 403 `CsrfRejection` `csrf-token-invalid`, and 403 `AccessDenial` `role-required`. When both a cookie and a bearer arrive, the bearer is used and the cookie ignored, because a browser never adds a bearer by itself (coordinator question Q11). The 9a routes are served only on the browser endpoint; the SDLC and execution routes stay on both listeners as today.

### 6. Authorization and the 404-or-403 rule

`AuthorizationService.authorize(principal, requirement)` answers ok or `forbidden` with `details.reason` `role-required`. A requirement is one of: `authenticated`, `installation-owner`, or `project(projectId, minimumRole)` with `project-viewer` < `project-operator` < `project-maintainer`. The table of wire contracts section 3 becomes one constant keyed by `operationId`, checked by a test against the document's operations, so a 9a operation without a requirement fails the build; handlers that items 11 to 15 add inherit it. Roles are read from the store on every request, never cached in the session, so a removal applies to the next request.

`installation-owner` satisfies `project(..., project-viewer)` only for the read operations that section 3 lists ("or `installation-owner`"); it satisfies no project mutation, as section 3 assigns those to `project-maintainer` alone.

**404 or 403.** Every such operation declares both 403 and 404, and section 2 requires the role check before the resource is read. For a path that names a project, the check runs on the named identifier before the project is looked up, so a principal without a role gets 403 `role-required` whether or not the project exists, and only a principal that passes the check, such as an `installation-owner` on a read, can learn 404. For a resource found by its own identifier (`readEvidence`, `downloadEvidence`, and the run and task paths), the record's project must be read first; an unknown identifier then answers 403 to a principal that is not `installation-owner` and 404 only to one that is, so the answer never tells a caller without a role whether the identifier exists. Coordinator question Q4.

The SDLC and execution operator operations get these requirements (coordinator question Q5): `createRun` and `submitTask` `project-operator` on the request's `projectId` or the run's project, `readAdmission`, `readTaskResult`, `readEvidence`, and `downloadEvidence` `project-viewer`, `listQuarantine` and `redriveQuarantined` `installation-owner` (disaster recovery quarantine, trust model section 3). The worker routes (`workerCredential`, `enrollmentToken`) and `readInstallationCa` are unchanged.

### 7. The first installation-owner

The bearer of `operatorToken` authenticates one principal (section 2, "Operator credential"). `OwnerBootstrapService` creates it once:

- A principal with a minted identifier (`u` and 32 hexadecimal digits, section 6), kind `operator`, login name `owner` (proposal; coordinator question Q1), no password, and the `installation-owner` role, bound to the operator credential singleton. One transaction writes the principal, the role, the binding, and an `access.owner-created` audit event with the actor and reason.
- New installations: `init` creates it right after the bootstrap credential. Existing installations: the migration does not create rows; the control plane start creates it when a credential exists and no owner is bound, with actor `control-plane` and reason `bootstrap owner from the G2 operator credential`. A unique constraint on the binding makes concurrent starts create it exactly once.
- `reset-operator-credential` replaces the credential and keeps the principal; the bearer then authenticates the same principal with the new secret.
- The owner logs in through the SPA only after a password is set (decision 8). Until then the bearer is its only credential, exactly as in G2.

### 8. Principal administration

The 9a document has no principal or password operation, and item 10 owns principal administration (wire contracts section 9). Proposal, coordinator questions Q1 and Q2: administrative commands of `apps/control-plane/src/admin/admin-main.ts`, which already read the operator credential from `TASKELITH_OPERATOR_TOKEN` for installation-owner commands:

- `set-password --login-name NAME --actor WHO --reason WHY`: reads the new password from standard input without echo, applies the policy, sets the hash, ends the principal's sessions, and audits `access.password-set`.
- `create-principal --login-name NAME --actor WHO --reason WHY`: a principal with no role and no password, audited `access.principal-created`.
- `assign-project-role` and `remove-project-role` through `PrincipalAdministration`, so that roles exist before item 11's member handlers; item 11 then routes `assignProjectMember` and `removeProjectMember` through the same service (coordinator question Q3).

Every command needs the operator credential and runs as the owner principal. Passwords never travel as arguments or environment variables.

### 9. Evidence download per project

`ControlPlaneApi.#download` and the `readEvidence` handler read the evidence record, then ask `AuthorizationService` for `project(record.projectId, project-viewer)` before any content is read, under the 404-or-403 rule of decision 6. The operations keep `operatorToken` as `execution.openapi.json` declares it; a browser session on them needs a 9c change (coordinator question Q5). The bearer's principal is the `installation-owner`, which passes as a reader.

### 10. Forward compatibility and the approver port

- `Principal.kind` is `operator` only, stored as a column with a check constraint, so a later `delegated` kind (a decision council, ADR 0014) is an added value, not a new table. Roles attach to a principal identifier, not to a login.
- `Approvers` (product ports section 2, rule 8): `authorizeApproval(principal, approval)` with an approval naming its project, its gate kind, and the decision body the gate names (`project-maintainer` or `delegated-reviewer`, the values of `SPEC_APPROVERS`). The G3 adapter answers ok for a `project-maintainer` on the project when the decision body is `project-maintainer` and refuses every other case with `role-required`; the delegated reviewer's approval is recorded by its own path, not by a human principal. No caller exists in item 10; the conformance suite fixes the contract for the item that records approvals. No council is implemented.

### 11. Persistence

One migration, `packages/adapters/postgres/migrations/1792932800000_operator-access.sql`, after `1792932700000_worker-admission.sql`:

- `principals(principal_id text PRIMARY KEY, kind text NOT NULL CHECK (kind IN ('operator')), login_name text NOT NULL UNIQUE CHECK (login_name ~ '^[a-z0-9][a-z0-9._-]{0,63}$'), password_hash text, created_at timestamptz NOT NULL, disabled_at timestamptz)`.
- `installation_roles(principal_id text PRIMARY KEY REFERENCES principals, role text NOT NULL CHECK (role = 'installation-owner'), granted_at timestamptz NOT NULL)`.
- `operator_principal(singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), principal_id text NOT NULL UNIQUE REFERENCES principals)`: the principal that the operator credential authenticates.
- `project_roles(project_id text NOT NULL, principal_id text NOT NULL REFERENCES principals, role text NOT NULL CHECK (role IN ('project-maintainer','project-operator','project-viewer')), assigned_at timestamptz NOT NULL, PRIMARY KEY (project_id, principal_id))`, with an index on `principal_id`. No foreign key to projects, which item 11 creates; item 11 adds it (coordinator question Q3).
- `browser_sessions(id_hash text PRIMARY KEY, csrf_token text NOT NULL, principal_id text REFERENCES principals, created_at, authenticated_at, last_seen_at, idle_expires_at, absolute_expires_at timestamptz, ended_at timestamptz)`, with an index on `idle_expires_at` for the purge and on `principal_id` for ending a principal's sessions.
- `access_audit_events(position bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, kind text NOT NULL, principal_id text, project_id text, role text, actor text NOT NULL, reason text NOT NULL, occurred_at timestamptz NOT NULL)`, immutable through the existing `refuse_audit_change` trigger function. A separate table, because `audit_events` requires a credential generation.

Repositories in `packages/adapters/postgres/src/access-repositories.ts`, exported from its index and run against the shared conformance suites in an integration test, as the fleet repositories are.

### 12. Logs, errors, and redaction

- The request log of the API server keeps only the allowlist of section 7: method, `operationId`, path and query parameters, status, and the failure, each passed through `redactFailure` and `redactSecrets` of `@taskelith/secrets`. It never reads the `Cookie`, `X-CSRF-Token`, or `Authorization` header, or a body that reaches a `writeOnly` schema.
- Failure messages name settings and identifiers only. `login-failed` never says whether the login name exists. Validation failures of `LoginRequest` name the field (`password`), never its value; the schema validator's output for `writeOnly` fields is replaced by a fixed message before it leaves.
- Audit events carry login names, principal identifiers, roles, actors, and reasons, never a password, hash, session identifier, or CSRF token.
- The administrative entry redacts its failures as it does today.
- Tests feed a known password, session identifier, and CSRF token through every failure path and the request log and assert that none appears in any output, log line, or audit row.

## Security risks

| Risk | Mitigation |
| --- | --- |
| Online password guessing | Per-login-name and per-source-address backoff: after 5 failures within 15 minutes a further attempt waits, answering 401 `login-failed` with a constant delay, without a new status (coordinator question Q8); every failure is logged with the login name and source address, never the password. |
| Login name enumeration by timing | An unknown login name verifies the password against a fixed dummy hash with the current parameters, so both paths cost one Argon2id computation. |
| Session fixation | A login rotates the identifier and the CSRF token in one write (decision 4). |
| Cross-site request forgery | `SameSite=Strict`, the `__Host-` prefix, and the CSRF header on every session-authenticated non-GET operation, compared in constant time; `logIn` itself needs it. |
| Session theft from the database | Only the SHA-256 of the identifier is stored; the stored CSRF token is useless without the cookie. |
| Cookie theft by scripts or plain HTTP | `HttpOnly`, `Secure`, no plain listener (TLS listeners requirement). |
| Hash cost as denial of service | At most two concurrent hashes and a bounded queue (decision 2); the 1024-character bound. |
| Anonymous session flooding | Short expiry, purge loop, and a cap (decision 4). |
| Privilege kept after removal | Roles read per request; a password change or disablement ends the principal's sessions. |
| A bearer in a browser | The bearer is refused on the session operations; the SPA never holds it. |
| Weak or legacy hashes | Rehash on login when parameters fall below the current ones. |
| Missing `crypto.argon2` | Start check fails closed (decision 2). |
| Secrets in logs and errors | Allowlist logging and redaction tests (decision 12). |
| Custom cryptography | Only the PHC codec is Taskelith code; the reviewer checks it against architecture section 7 (item 1). |
| Lockout of the owner | The owner keeps the bearer and the audited `reset-operator-credential` and `set-password` commands. |

## Proof of concept conformance

The Mantine proof of concept in `docs/ui-poc/` is the binding UI reference (ADR 0011). Item 10 is backend only; its responses must serve these states. **Reviewers must check conformance of the backend to the proof of concept's sign-in flow, sign-out, and denial states below.**

| Proof of concept state or message | Source | Backend response |
| --- | --- | --- |
| "Checking your session…" before anything is shown; a missing or expired session shows the sign-in screen | `docs/ui-poc/src/main.tsx:192-224` | `readSession` 200: `AnonymousSession` (sign-in screen) or `AuthenticatedSession` (shell); an expired or ended cookie yields a new anonymous session |
| Sign-in form "Username" and "Password", "Sign in" | `main.tsx:142-190` | `logIn` with `loginName` and `password`, the anonymous session's cookie and `X-CSRF-Token` |
| "Invalid username or password." | `main.tsx:157` | 401 `AuthenticationFailure` `login-failed`, which does not say which is wrong; an empty field is 400 `invalid` from the schema, which the SPA can prevent client-side |
| "You are signed out. Agents and merges keep running; only this browser session ended." | `main.tsx:169`; README line 26 | `logOut` 204 ends only this session and expires its cookie; no run, task, or other session changes |
| Account menu "Signed in as …" with the operator's roles | `main.tsx:118-121` | `AuthenticatedSession.principal.loginName` and `installationRoles`; project roles are not in the session (coordinator question Q12) |
| "Change password", "Account settings" (inert; "belong to G3 item 10") | `main.tsx:131-132`; README line 26 | No 9a operation; administrative `set-password` only (coordinator question Q2) |
| "Sign out" | `main.tsx:134-136` | `logOut` |
| First run: "Sign in with the bootstrap credential of the installation to create the first installation-owner", action "Sign in as installation-owner" | `docs/ui-poc/src/screens/States.tsx:45-49` | No 9a operation accepts the bearer for a session; the owner is created from the credential (decision 7) and gets a password administratively (coordinator question Q1) |
| A role-gated action stays visible but disabled with "Needs <role>" | `docs/ui-poc/src/ui.tsx:292-308`; `store.tsx:67-77` | 403 `AccessDenial` `role-required`; decision proposed in coordinator question Q10 adds `details.requiredRole` |
| A session that expires while in use returns to the sign-in screen | `main.tsx:192-193` | Any operation answers 401 `unauthenticated`; the SPA calls `readSession` |
| The persona switch | `main.tsx:123-129` | Proof-of-concept only; no backend counterpart |

## Coordinator questions

Each lists options and a recommendation; the worker does not decide them.

- **Q1. First installation-owner and the proof of concept's first-run sign-in.** The proof of concept signs in "with the bootstrap credential" in the browser (`States.tsx:45-49`); the contract refuses the bearer on the session operations and has no operation that creates a principal or sets a first password (section 2, "Operator credential"). Options: (a) create the owner principal from the credential (decision 7, login name `owner`) and set its password by the administrative `set-password` command; the first-run step then reads "set the owner's password with the bootstrap credential"; (b) as (a), plus an additive 9b operation, for example `POST /installation/owner-password` accepting only `operatorToken`, so the browser's first run can do it; (c) accept the bootstrap credential as the password of login name `owner` in `logIn`. Recommendation: (a) in item 10 and (b) as a 9b follow-up if the owner wants the browser first run; not (c), which would put the bearer into the browser and the session table. Also confirm the login name `owner` or name another.
- **Q2. Password change and account settings.** The proof of concept shows "Change password" and "Account settings" as item 10's; 9a defines neither. Options: (a) administrative `set-password` and `create-principal` now, HTTP operations (change own password with the current one, list and create principals) in 9b; (b) amend 9a now. Recommendation: (a); a contract change belongs to the contract sub-changes, and the menu items stay inert until 9b.
- **Q3. Ownership of members and project existence.** Item 11 lists "members and their roles"; wire contracts section 9 gives item 10 principal administration. Options: (a) item 10 owns the role store, `PrincipalAdministration.assign/remove`, and administrative commands; item 11 adds the projects table, the foreign key from `project_roles`, the member handlers over item 10's service, and a `ProjectDirectory` port that tells the 404-or-403 check whether a project exists; (b) item 10 also implements the member handlers against a project table stub. Recommendation: (a).
- **Q4. The 404-or-403 rule.** Decision 6 reads section 2's order (role before resource) as: 403 `role-required` for a principal without a role whether or not the project or the record exists, 404 only for a principal that passes. Options: (a) as decision 6; (b) 404 for an unknown identifier to every principal and 403 only for an existing foreign one, which tells a caller without a role which identifiers exist. Recommendation: (a), which needs no contract change.
- **Q5. Roles on the G2 operator operations and the browser session there.** The SDLC and execution documents declare only `operatorToken`. Options for roles: (a) decision 6's mapping (`project-operator` for `createRun` and `submitTask`, `project-viewer` for the reads and evidence, `installation-owner` for quarantine), under which the bearer's owner principal, which holds no project role, loses `createRun` and `submitTask` until a role is assigned; (b) as (a), but the `installation-owner` also passes the project requirements of these G2 operations until item 11 lands, recorded as a deviation; (c) the owner holds every project role implicitly. Recommendation: (b), so the G2 smoke and failure scenarios keep running through the bearer, with a follow-up in item 11 that removes the exception once projects and memberships exist; the 9a document's own table stays strict. For the session: adding `browserSession` to `readEvidence` and `downloadEvidence` is a 9c change; item 10 authorizes by role whatever scheme authenticates.
- **Q6. Session lifetime and anonymous sessions.** Proposal: idle 8 hours, absolute 24 hours, anonymous 15 minutes, renewal at most once a minute, cap of 10 000 anonymous sessions. Options: these values; shorter (idle 30 minutes, absolute 12 hours, OWASP's range for higher-value applications); or owner-set values in installation settings. Recommendation: the proposal as provisional operational targets, to be verified in G6 like the other provisional values.
- **Q7. Password policy.** Options: (a) 15 to 1024 code points, no composition rules, not equal to the login name (NIST SP 800-63B rev. 4, single factor); (b) minimum 8 with a breached-password list, which needs a list or a service (a new dependency). Recommendation: (a).
- **Q8. Login throttling.** The contract gives `logIn` no 429. Options: (a) backoff behind 401 `login-failed` with a constant delay (decision in "Security risks"); (b) add 429 with `Retry-After` in a contract change. Recommendation: (a) now; (b) only if the SPA must show a distinct message.
- **Q9. Dependencies.** Argon2id uses the built-in `crypto.argon2` (no package). One more registered candidate is needed: `cookie@2.0.1` (`docs/dependencies.md:144`), which item 1 recommends for parsing and serializing the cookie. Options: (a) adopt `cookie@2.0.1` and move it and `crypto.argon2` from `candidate` to the adopted status in the register; (b) a Taskelith parser for the one cookie name, no package. Recommendation: (a), as item 1 recommends. Also confirm the hasher's place in `@taskelith/secrets` rather than a new adapter package.
- **Q10. Required role in a denial.** `AccessDenial.details` allows further string properties. Options: (a) add `details.requiredRole` (for example `project-operator`) so the SPA can say "Needs project-operator" from the server's answer, as the proof of concept does; (b) only the reason. Recommendation: (a); it settles a detail without a schema change, and the contract page should then name it (a 9b wording follow-up).
- **Q11. Cookie and bearer together.** The contract does not say which wins. Options: (a) the bearer wins and the cookie is ignored, so no CSRF check applies; (b) refuse the request with 400 `invalid`. Recommendation: (a), because a browser never adds the bearer by itself.
- **Q12. Project roles for the account menu and role-gated buttons.** `AuthenticatedSession` carries only `installationRoles`; the proof of concept shows the caller's project roles and disables actions by role. Options: (a) the SPA reads `listProjectMembers` and filters by its own `principalId` (a viewer may list members); (b) a 9b addition of the caller's role to `Project` or of the project roles to the session. Recommendation: (b) in 9b; item 10 needs no change for either.
- **Q13. Evidence retirement.** Deferred until its 9b to 9d operation lands in `dev`, as the brief says. Options: (a) a follow-up change of item 10 after that sub-change; (b) keep this change open until then. Recommendation: (a), so item 10 does not block item 11.

## Implementation plan

Files to touch, in order:

1. `packages/modules/access/src/domain/`: `principal.ts`, `roles.ts`, `session.ts`, `password-policy.ts`, `authorization.ts` (requirements and rank order). `src/ports/`: `principals.ts`, `project-roles.ts`, `sessions.ts`, `password-hasher.ts`, `access-audit.ts`, `approvers.ts`, and their conformance suites. `src/application/`: `session-service.ts`, `authorization-service.ts`, `owner-bootstrap-service.ts`, `principal-administration.ts`, `role-approvers.ts`. `src/adapters/`: in-memory adapters. `src/index.ts`.
2. `packages/adapters/secrets/src/argon2id-password-hasher.ts` and `phc.ts`; `src/index.ts`.
3. `packages/adapters/postgres/migrations/1792932800000_operator-access.sql`; `src/access-repositories.ts`; `src/index.ts`; `test/access-conformance.integration.test.ts`.
4. `apps/control-plane/src/api/`: `routes.ts` (alternatives, the 9a session routes, requirements by `operationId`), `api-server.ts` (order of section 2, cookies, `no-store`, request log allowlist), new `session-cookie.ts`, `request-log.ts`, `access-requirements.ts`; `control-plane-api.ts` (`readSession`, `logIn`, `logOut`, evidence authorization). `src/composition/control-plane.ts` (wiring, owner bootstrap at start, purge loop, browser-only routes), `src/admin/admin-main.ts` and `administration.ts` (`set-password`, `create-principal`, role commands, owner creation in `init`).
5. Dependency register and inventory for `cookie@2.0.1` if Q9 (a); `docs/contracts/control-plane-wire-contracts.md` only for wording the coordinator approves.

## Test plan

- Unit (module, in-memory adapters): role ranks and every row of the section 3 table, the 404-or-403 rule for each path shape, session state transitions (anonymous, login rotation, idle and absolute expiry, renewal throttle, logout, repeat logout 401), password policy bounds, owner bootstrap once under concurrency, administration audit events, approver port cases.
- Codec and hasher: the RFC 9106 vector, round trip, rehash detection, hostile PHC strings, the start check with `crypto.argon2` absent (injected), the concurrency bound.
- PostgreSQL: the shared conformance suites against real PostgreSQL through `make test`, concurrent owner creation, the immutable audit trigger, the purge.
- HTTP (control-plane API tests over TLS, as today): the exact `Set-Cookie` attributes and `Cache-Control: no-store` of `readSession` and `logIn`; login rotation (old cookie 401); CSRF missing, wrong, other session's token, and bearer without CSRF; the order authenticate, CSRF, role, body (a forbidden request with an invalid body answers 401 or 403, not 400); bearer refused on session operations; the evidence 403 and 404 cases; a test generated from the document that every 9a operation has a requirement and its security alternatives; the redaction tests of decision 12; existing G2 operator and worker tests unchanged under Q5's outcome.
- Coverage: the module, the hasher, and the new control-plane files each reach at least 75% lines, branches, and functions under `make verify`; the PHC codec and the CSRF comparison aim at 100% branches.

## Review checklist

The brief's checklist (`checklist.json`, dev `a3a0ac4c`, size M-L) ranks for these capabilities and files: contract-drift, missing-fail-before-test, docs, naming, error-handling, spec-wording, and concurrency-race; and for records: evidence-mismatch, docs, spec-wording, stale-citation, contract-drift, process, and scope. How this change meets them: a test derives the route alternatives and requirements from the document (contract-drift); every role and CSRF rule has a test that fails without the check (missing-fail-before-test); one term per concept, `principal`, `session`, `role`, `requirement` (naming); failures follow section 2's table and leave no partial session or audit write (error-handling); owner creation, login rotation, and role replacement are single transactions with concurrency tests (concurrency-race); citations name files and sections, with line numbers only at the base commit `a3a0ac4c` (stale-citation).

## Risks / Trade-offs

- The owner's bearer keeps its G2 reach only if Q5 (b) is chosen; otherwise G2 project operations need a role first.
- Storing the CSRF token in clear is needed to return it from `readSession`; it is useless without the cookie, whose identifier is stored only hashed.
- Without a projects table, `project_roles` accepts any project identifier until item 11 adds the foreign key.
- The anonymous session is a write per unauthenticated `readSession`; the cap bounds it, but a flood can push out legitimate anonymous sessions, whose holders then reread the session.

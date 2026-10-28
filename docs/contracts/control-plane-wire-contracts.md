# Control-plane wire contracts

Date: 2026-10-28. Status: proposed wire contract for G3 ([G3 work plan](../g3-plan.md) item 9, sub-change 9a `define-control-plane-access-contracts`), under independent review. It states the rules of the control-plane access document that its schemas cannot express. The document is the source of the field definitions; this page never repeats a field list. Items 10 to 15 implement it; this sub-change adds no adapter and no handler.

## 1. Document

| Document | Version | Content |
| --- | --- | --- |
| [`control-plane.openapi.json`](../../packages/contracts/documents/control-plane.openapi.json) | 0.1.0 | Login and sessions; projects with their members, defaults, auto-merge setting, repository binding, and pool slots; the workers view; enrollment tokens; account slots; SCM integrations; the webhook receiver |

It lives in `@taskelith/contracts` beside the SDLC and execution documents, and the build generates its types and validators with theirs, exported as `HttpComponents`, `HttpOperations`, and `HttpPaths` and checked by `checkHttpSchema`. It reuses, unchanged, `Failure`, `Identifier`, `Instant`, `DisplayText`, `Generation`, `Platform`, and `Architecture` of the execution and SDLC documents and `SelfCheckResult`, `SelfCheckId`, and `NotApplicableReason` of `execution.asyncapi.json`, because the generator refuses one component name with two schemas. Since this sub-change it also refuses one security scheme name with two definitions; before it, the later document's scheme silently replaced the earlier one. `operatorToken` is therefore the scheme of the other documents, unchanged.

The control plane serves the document on the browser endpoint over HTTPS, same-origin with the SPA ([architecture section 11](../architecture.md#11-spa-authentication-and-live-traffic); [installation contract](installation-and-enrollment.md) section 7).

## 2. Authentication and CSRF

| Scheme | Kind | Used by |
| --- | --- | --- |
| `browserSession` | Cookie `__Host-taskelith-session`: a server-side session identifier of 256 random bits, set with `HttpOnly`, `Secure`, `SameSite=Strict`, and `Path=/`, without `Domain` | The SPA |
| `csrfToken` | Header `X-CSRF-Token`: the session's CSRF token, 256 random bits in base64url | The SPA, with the cookie, on every operation other than GET |
| `operatorToken` | Bearer: the installation bootstrap credential of decision D10 (a) ([installation contract](installation-and-enrollment.md) section 4) | The CLI and the owner |

- **Sessions.** Sessions are server-side (G3 decision D2 (a)). `readSession` needs no credential: without a valid session cookie it starts an anonymous session, sets its cookie, and returns its CSRF token. `logIn` is a mutation like any other, so it needs that anonymous session's cookie and token, which protects the login itself against cross-site requests. A successful login gives the session a new identifier and a new CSRF token, so an identifier known before the login is worthless after it. `logOut` ends the session and expires its cookie. Item 10 sets the session lifetime, the password policy, and the hashing.
- **Mutations.** Every operation other than GET, the receiver of section 5 aside, accepts the session cookie together with the CSRF header. Every one of them except the session operations `logIn` and `logOut` also accepts the operator bearer alone, and none accepts another credential. The tests `every operation other than GET requires the CSRF header with the session cookie` and `every mutation but the session operations also accepts the operator bearer alone` check the document. A bearer request needs no CSRF token, because a browser never adds the bearer by itself. The control plane compares the token with its session's in constant time.
- **Operator credential.** The bearer authenticates the principal that item 10 creates from the G2 bootstrap credential, the first `installation-owner`; authorization then checks that principal's roles like any other principal's (section 3). It is not accepted by the session operations.
- **Order and failures.** For every operation with a session or bearer requirement, the control plane authenticates first, then checks the CSRF token, then the role, and only then reads the request body, so a caller without access learns nothing about the resource. The webhook receiver authenticates by a signature over the body, so it reads the body first, in the order of section 5. Every failure is the kernel `Failure` shape with code `forbidden` and a `details.reason`:

| Status | Schema | Reason | When |
| --- | --- | --- | --- |
| 401 | `AuthenticationFailure` | `unauthenticated` | No valid session cookie or bearer, or an ended session |
| 401 | `AuthenticationFailure` | `login-failed` | A login name and password that do not match; the answer does not say which is wrong |
| 403 | `CsrfRejection` | `csrf-token-invalid` | A session-authenticated mutation without the header or with another session's token; nothing took effect |
| 403 | `AccessDenial` | `role-required` | The principal lacks the role of section 3 |

A mutation's 403 response is one of `AccessDenial` and `CsrfRejection`, which differ by their reason. The other statuses follow the kernel codes as in the execution document: 400 `invalid`, 404 `not-found`, 409 `conflict`, 422 `precondition-failed`, 500 `internal`, and 503 `unavailable`.

## 3. Authorization

The Access module checks the role before any port is called; a port never decides authorization ([product ports](product-ports.md) section 2, rule 1; [account pool contract](account-pool.md) section 2, rule 1). The roles are those of [trust model](../trust-model.md#3-project-scoped-authorization-roles) section 3; each principal has at most one role per project.

| Operations | Role |
| --- | --- |
| `readSession`, `logIn`, `logOut` | None; section 2 |
| `listProjects`, `listScmIntegrations`, `readScmIntegration` | Any authenticated principal; `listProjects` returns the projects on which the caller holds a role, and every project to an `installation-owner` |
| `readProject`, `listProjectMembers`, `readProjectDefaults`, `readAutoMergeSetting`, `readRepositoryBinding`, `listProjectAccountSlots` | `project-viewer` or above on the project, or `installation-owner` |
| `updateProject`, `updateProjectDefaults`, `updateAutoMergeSetting`, `bindRepository` | `project-maintainer` on the project |
| `createProject`, `assignProjectMember`, `removeProjectMember`, `listWorkers`, enrollment tokens, account slots, `createScmIntegration`, `updateScmIntegration` | `installation-owner` |
| `receiveScmWebhook` | None; section 5 |

An `installation-owner` manages operator principals, so assigning project roles is its command; a project has no member until one is assigned, and its creator gets no role by creating it.

## 4. Operations

- **Projects.** A project is created with its name and its defaults; its auto-merge setting starts on ([product ports](product-ports.md) section 6.2). The defaults are the SDLC framework plugin that new runs bind to, the harnesses in the project's order of preference, the first of which is the default implementer and the rest the harnesses tried after a limit ([account pool contract](account-pool.md) sections 4.1 and 4.4), the default reviewer, the spec approver (`SPEC_APPROVERS`), and the policy for no eligible slot (section 4.5 there). A change of the defaults applies to tasks created afterwards and changes no run.
- **Auto-merge.** Its own resource with its own revision, as the `AutoMergeSettings` port keeps it; a change records or revokes the push standing rule in the same transaction ([product ports](product-ports.md) sections 5 and 6.2).
- **Repository binding.** One repository of one SCM integration per project, with the integration branch that merges target and the merge method ([source control contract](source-control.md) section 4; [product ports](product-ports.md) section 6.3). The repository is an opaque external identifier, and the binding also holds its HTTPS remote URL without user information, which workspaces clone from and push to, and the integration branch is their base branch ([git workspace contract](git-workspace.md) sections 3 and 7). A branch is any name that `git check-ref-format --branch` accepts; Git sets no length limit, so the document's bound of 1024 characters only bounds the request. A first binding has no expected revision; a later change needs one.
- **Compare-and-set.** `updateProject`, `updateProjectDefaults`, `updateAutoMergeSetting`, `bindRepository` on a bound project, the slot commands `updateAccountSlot`, `revokeAccountSlot`, `reinstateAccountSlot`, `rotateSlotCredential`, and `removeAccountSlot`, and `updateScmIntegration` name the revision they read and fail with 409 `conflict` when the revision moved, so of two concurrent updates exactly one wins ([product ports](product-ports.md) section 2, rule 7). The exceptions name no revision: the first binding of a project, which fails with 409 when the project is already bound; a member assignment, which is idempotent by the project and principal, so of two concurrent assignments the one serialized last stays; a member removal, which succeeds for a principal that is no member; and the enrollment token commands, which serialize with redemption instead.
- **Workers.** `listWorkers` maps `WorkerAdmissionView.workers()` ([worker admission](worker-admission.md) section 8): every enrolled worker that is not revoked, in identifier order, with no credential or credential hash, every detail redacted again, and 503 with no partial data when a source cannot be read.
- **Enrollment tokens.** `issueEnrollmentToken` takes the host constraints and returns the token's record and its secret, `tken_` and 256 random bits ([installation contract](installation-and-enrollment.md) section 5). `rotateEnrollmentToken` replaces a pending token by a new one with the same constraints and a new TTL in one transaction, and `revokeEnrollmentToken` makes a pending one unusable. Both serialize with a redemption on the token's row lock, so of a rotation or revocation and a concurrent `enrollWorker` exactly one wins. `listEnrollmentTokens` returns pending tokens: unused, unexpired, and not revoked. Worker credential rotation and worker revocation stay administrative commands (installation contract section 4): a rotated generation's secrets belong to the worker, which G3 item 26 delivers them to.
- **Account slots.** The operations map the commands of the [account pool contract](account-pool.md): adding a slot with its credential (sections 3.1 and 7.1, 400 for a mechanism without an admitted delivery or a slot beyond its pair's limit), changing its allowed projects or concurrency limit, revoking, reinstating, rotating its credential (section 8.1, 409 while the slot is active or a held reservation names it), and removing it (section 8). `listProjectAccountSlots` shows a project member the active slots of the project's pools, with whether each also serves other projects but never their names, as section 2, rule 1 requires of item 9.
- **SCM integrations.** An integration is installation-wide: one SCM plugin with a label, the plugin's non-secret settings, and its write-only secrets, which the plugin defines and checks; the core document names no SCM ([source control contract](source-control.md) section 2, rule 1).

## 5. Webhook receiver

`receiveScmWebhook` takes `POST /scm-integrations/{integrationId}/webhooks` with no session, CSRF token, or operator credential: the delivery's signature is its authentication. Its order is therefore its own: the receiver reads at most its limit of raw bytes and answers 413 beyond it, then has the plugin verify the signature over those bytes, and only then parses the payload. It never parses the body before verification, and passes it with the headers in lower case to the integration's plugin, whose `verifyWebhookDelivery` checks the signature over those bytes ([source control contract](source-control.md) section 6). The plugin names its signature and delivery headers, so the document declares none. An unknown integration and a failed verification both answer 401 with the same body, so an unauthenticated sender learns nothing. A verified delivery answers 202, also when it repeats one already recorded by its `deliveryId`; 413 answers a body over the receiver's limit, which item 20 sets. The receiver needs an ingress that the SCM can reach, which items 26 and 37 provide.

## 6. Identifiers and pages

- **Minted identifiers.** The control plane mints the identifier of a new project, principal, enrollment token, slot, or SCM integration as `workerId` is minted ([installation contract](installation-and-enrollment.md) section 2): one lowercase letter, `p`, `u`, `e`, `s`, or `i` respectively, and 32 lowercase hexadecimal digits from 128 random bits, a safe name that can become a NATS subject token. On the wire every identifier is an `Identifier`.
- **Pages.** Every list except `listWorkers` returns at most 100 items in the code-unit order of their identifiers ([account pool contract](account-pool.md) section 2, rule 2) and a `next` identifier while more remain, which the caller passes as `after`. `listWorkers` returns the workers view as one unpaged snapshot, as its port returns it; the test `every list but the workers snapshot pages by identifier` checks the document.

## 7. Secrets in requests and responses

- **Write-only.** A password, a slot credential, and an SCM integration's secrets travel only in request bodies and carry `writeOnly`; no response schema reaches them, which a test checks. An SCM integration returns the names of its secrets, never their values.
- **One-time reveal.** The only stored secret that a response carries is a new enrollment token's secret, in the 201 response of `issueEnrollmentToken` or `rotateEnrollmentToken`. Only its hash is stored, so no later response can repeat it.
- **Session values.** The session identifier travels only in the `Set-Cookie` header of `readSession` and `logIn`, never in a body. The CSRF token is in the body of `readSession` and `logIn`; it authenticates nothing without the cookie.
- **No caching.** Each response that carries the token's secret or a CSRF token has `Cache-Control: no-store`.
- **Failures and logs.** A failure names settings and identifiers, never a secret value, and the control plane redacts every logged request and failure with `@taskelith/secrets` ([installation contract](installation-and-enrollment.md) section 8).

## 8. Versioning

The document starts at 0.1.0. A change that `make contract-compatibility` reports as breaking needs a higher minor version while the major version is 0 ([ADR 0004](../decisions/0004-first-class-engineering-principles.md) principle 6). The check skips a document missing at the merge base, so this first version is checked from the next change on.

## 9. Left to other items

- **9b:** the board, task detail, inbox, sessions and turns, approval responses, and the SSE event stream with its durable cursor, in this document.
- **9c:** the extensions of `execution.openapi.json`.
- **9d:** the AsyncAPI messages that deliver turns, approval responses, and a refreshed per-run SCM credential to a worker and carry session observations and the adoption confirmation back, and the terminal WebSocket.
- The other operations of the item 9 row, such as evidence retirement and the reconciliation queue and re-admission of item 44, belong to 9b to 9d.
- **Item 10:** the `Access` adapter that implements section 2 and section 3, principal administration, and per-project evidence download.
- **Items 11, 12, 15, 20, 33, and 34:** the handlers of section 4 and 5 and the screens over them.

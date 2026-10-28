## Why

G3 decision D2 (a) ([G3 work plan](/docs/g3-plan.md#owner-decisions)) makes operator login Taskelith-owned: password login with server-side sessions in PostgreSQL behind the replaceable `Access` adapter. Sub-change 9a (`define-control-plane-access-contracts`) defined the wire side in `packages/contracts/documents/control-plane.openapi.json` and [the control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) sections 2, 3, and 7, and leaves the adapter, principal administration, the session lifetime, the password policy, and the hashing to item 10 (section 9 there). The [trust model](/docs/trust-model.md#3-project-scoped-authorization-roles) section 3 requires every mutating command and query to be authorized against the caller's role before domain execution, and G2 still grants every operator operation, evidence download included, to the one installation-wide operator credential ([ADR 0015](/docs/decisions/0015-g2-closure.md) decision 5; `implement-evidence-store` decision Q2).

G3 item 10 (`implement-operator-login-and-roles`, plan row 10, size M-L) closes that gap.

## What Changes

- `@taskelith/access` gains operator principals, an installation role, per-project roles, server-side sessions with CSRF tokens, password login, an authorization service that checks the role of section 3 of the wire contract before any port is called, and an approver port for later gate approvals; each store is a port with a conformance suite and an in-memory adapter.
- A password hasher adapter over the built-in `crypto.argon2` of Node 24.22.1 (argon2id), the option that item 1 qualified, with a PHC string codec.
- `@taskelith/postgres` gains a migration and repositories for principals, roles, sessions, and the access audit trail, run against the shared conformance suites.
- The control plane serves `readSession`, `logIn`, and `logOut` on the browser endpoint, accepts the session cookie with the CSRF header or the operator bearer as each operation declares, checks the role after authentication and CSRF and before reading the body, and logs only an allowlist of request parts.
- The installation's operator credential authenticates one principal, the first `installation-owner`, created once from the G2 bootstrap credential and audited.
- `readEvidence` and `downloadEvidence` are authorized per project by the evidence record's project.
- Administrative commands for the owner principal's password, subject to the coordinator questions of [design](design.md).

Excluded: OpenID Connect, project setup and the member handlers (item 11), the SPA (item 28), the UI event stream (item 14), and the evidence retirement entry, whose wire operation belongs to sub-changes 9b to 9d and is built only after it lands in `dev`. No contract document changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `control-plane-api`: session operations, the authentication, CSRF, and role order of every operation, per-project evidence authorization, and request logs.
- `trust-and-operational-foundation`: operator principals and roles behind the `Access` port, the first `installation-owner`, password storage, and the approver port.

## Impact

`packages/modules/access`, `packages/adapters/secrets`, `packages/adapters/postgres` (one migration), and `apps/control-plane` (API server, routes, composition, administrative entry). Commit type `chore`: no change to the published `taskelith` package.

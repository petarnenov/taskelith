## Why

[ADR 0004](/docs/decisions/0004-first-class-engineering-principles.md) principle 6 makes every HTTP API contract-first, the control-plane API used by the SPA included: a versioned OpenAPI 3.1 document is written and reviewed before the implementation. [Architecture section 11](/docs/architecture.md#11-spa-authentication-and-live-traffic) requires server-side sessions, cookie protections, CSRF protection for mutations, and server-side authorization. G3 item 9 (`define-g3-wire-contracts`, [G3 work plan](/docs/g3-plan.md) row 9) owes these operations before items 10 to 15 implement them, and the item 3 to 8 contracts leave their wire mapping to it: the workers view ([worker admission](/docs/contracts/worker-admission.md) section 8), the slot commands and pool views ([account pool contract](/docs/contracts/account-pool.md) section 10), and the webhook receiver ([source control contract](/docs/contracts/source-control.md) sections 6 and 10).

The coordinator split item 9 on 2026-10-28. This change is sub-change 9a, size M: the access and setup half of a new control-plane document. 9b adds the board, task, inbox, session, turn, and SSE operations to the same document; 9c extends `execution.openapi.json`; 9d adds the AsyncAPI worker messages and the terminal.

The generator also merged the security schemes of the OpenAPI documents with `Object.assign` (`scripts/generate-contracts.ts:110` at `9196804b`), so a second document could silently redefine `operatorToken`. A third OpenAPI document that reuses that name makes the gap real.

## What Changes

- New document `packages/contracts/documents/control-plane.openapi.json`, OpenAPI 3.1.0, `info.version` 0.1.0, registered in the generator, so its types are exported with the others: 34 operations for login, logout, and the current session; projects with their members and roles, defaults, auto-merge setting, repository binding, and pool slots; the workers view; enrollment tokens; account slots; SCM integrations; and the webhook receiver.
- Security schemes: the `browserSession` cookie (`HttpOnly`, `Secure`, `SameSite=Strict`, under the `__Host-` prefix) with the `csrfToken` header on every mutation, and the existing `operatorToken` bearer for the CLI and the owner; distinct 401, authorization 403, and CSRF 403 failure schemas.
- Generator: `mergeSecuritySchemes` refuses one security scheme name with two definitions, with a test.
- Contract tests for the document, and the document added to the shared-vocabulary test.
- New page `docs/contracts/control-plane-wire-contracts.md`, linked from the G3 plan row 9, which names the sub-changes, and from the execution wire contracts.
- Spec deltas: the new capability `control-plane-wire-contracts`, and `sdlc-wire-contracts` "Generated types", which gains the security scheme refusal.

## Capabilities

### New Capabilities

- `control-plane-wire-contracts`: the control-plane access document, its security schemes, failures, authorization, operations, identifiers, pages, secrets, and version.

### Modified Capabilities

- `sdlc-wire-contracts`: "Generated types" also fails on a security scheme name with two definitions.

## Impact

The private package `@taskelith/contracts` (one document, tests), `scripts/generate-contracts.ts` and its test, and documentation. No adapter, handler, route, or published package content; no change to the other documents, so their versions stay. Items 10 to 15, 20, 33, and 34 implement or show the operations.

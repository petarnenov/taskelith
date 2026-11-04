## Context

`control-plane.openapi.json` 0.5.0 declares the workers view and the four enrollment token operations ([control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) sections 4, 6, and 7). The CLI already serves the view (`Administration.workerAdmission`, printed through `printableWorkerAdmission`) and token issue (`EnrollmentService.issueToken`, which returns only the secret). `enrollment_tokens` has `secret_hash` as its key and `used_at`; no identifier, revocation, or rotation link exists, and a redemption that wire doc section 12 assigned to 26c, refusing a revoked token, was never added. `RouteDefinition` maps failure codes and reasons to the declared statuses, and `successResponse` checks every body against its schema, so a stray field fails as 500 rather than leaking.

## Goals / Non-Goals

Goals: the five operations exactly as the document states them, the roles of `access-requirements.ts`, the secret only in the 201 of issue and rotate with `Cache-Control: no-store`, revoke and rotate serialized with redemption on the token's row lock, and a redemption that refuses a revoked token.

Non-goals: a contract change, audit events for token commands, worker revocation or rotation over HTTP, reachability and capacity in the view, and any UI.

## Decisions

The coordinator (Niki) decided Q1 to Q6 on 2026-11-04; each decision below names its question.

1. **Revoked-token redemption (Q1).** `unusedToken` and `enroll` read only rows whose `revoked_at` is null; `enroll` of a revoked token fails with reason `token-revoked`, which `EnrollmentService` maps to `token-invalid` like `token-used` and `token-expired`. The `installation-enrollment` requirement "Single-use enrollment" is MODIFIED to name a revoked token, and the race of control-plane wire contracts "Revocation races a redemption" has a test in the fleet module and in the conformance suite.
2. **Identifier backfill (Q2).** The migration adds `token_id text`, fills every existing row with `'e' || replace(gen_random_uuid()::text, '-', '')`, then sets `NOT NULL` and `UNIQUE`; `gen_random_uuid()` is core since PostgreSQL 13, and the pinned image is `postgres:18.6-trixie` (`infra/services/compose.yaml`, `infra/installation/compose.yaml`). No row is deleted: a pending token stays redeemable, and a used or expired one keeps its state. `revoked_at timestamptz` and `replacement_token_id text REFERENCES enrollment_tokens (token_id)` are added beside it; the down migration drops the three columns. The migration test inserts a pending, a used, and an expired row before the migration and checks that each keeps working after it.
3. **Service (Q3).** A new `EnrollmentTokenService` in `packages/modules/fleet/src/application/` takes the registry, `Secrets`, `IdentifierSource`, and the clock: `issue`, `list`, `revoke`, and `rotate`. `EnrollmentService.issueToken` builds one from its own dependencies and returns the secret, so minting has one path and the CLI bundle is unchanged. `IdentifierSource` gains `newEnrollmentTokenId`.
4. **Audit (Q4).** No audit event is written; a follow-up names it.
5. **`token-rotated` (Q5).** Revoking a token that a rotation replaced answers 422 `token-rotated` with the direct replacement in `details.replacementTokenId`, as the schema and wire doc section 4 state; the chain is not followed, and the replacement may itself be used or revoked by then.
6. **Rotation before expiry (Q6).** The registry decides after the row lock, in this order: unknown is `not-found`; used is `token-used`; a replacement is `token-rotated`; already revoked is a repeat, 204; otherwise the token, expired or not, is revoked, since neither can be redeemed. A rotation refuses a used, revoked, or expired token alike with `token-not-pending`, expiry read after the lock with `clock_timestamp()` as `enroll` reads it.
7. **Registry port.** `pendingTokens(after, limit)` returns unused, unrevoked, unexpired tokens after `after` in identifier order; `tokenById` returns the record without its hash; `revokeToken(tokenId, at)` and `rotateToken(tokenId, replacement, at)` decide under the lock. The refusal rules are domain functions (`revocationRefusal`, `rotationRefusal`) that both adapters apply, so the two cannot drift. A rotation inserts the replacement and marks the old row in one transaction; the in-memory adapter checks and writes without awaiting, as its other methods do.
8. **Handler.** `FleetApi` in `apps/control-plane/src/api/` serves the five operations over `ApiServices.fleet` (`workers: WorkerAdmissionView`, `tokens`). `listWorkers` applies `printableWorkerAdmission`, the CLI's re-redaction. A `tokenId` path parameter that is not an `Identifier` answers 400. The list pages by identifier with at most 100 tokens and `next`, through the exported `afterOf` of `project-api.ts`. The routes are not `confidential`: the composition would drop them from the browser listener, and the document allows `browserSession`.
9. **One-time reveal.** The secret is in the 201 body of issue and rotate and nowhere else: no handler logs it, no failure carries it, the request log holds only the allowlist, and `Cache-Control: no-store` is sent on every response (`http-exchange.ts`), which the tests assert on the 201.

## Risks / Trade-offs

- `EnrollmentToken` gains a required `tokenId`, so every caller of `addToken` and the `fleetToken` fixture change; the conformance fixtures derive an identifier from the hash.
- A rotation reads the token first and then rotates under the lock, so a redemption between the two answers `token-not-pending`, the declared outcome.
- `listWorkers` is unpaged, as section 6 states; a fleet of hundreds of workers is one response.

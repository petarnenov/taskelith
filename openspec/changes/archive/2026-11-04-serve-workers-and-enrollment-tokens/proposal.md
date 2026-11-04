## Why

G3 plan item 33 ([G3 plan](/docs/g3-plan.md) row 33), change 1 of the coordinator's plan of 2026-11-04. `control-plane.openapi.json` 0.5.0 declares `listWorkers`, `listEnrollmentTokens`, `issueEnrollmentToken`, `revokeEnrollmentToken`, and `rotateEnrollmentToken`, and `access-requirements.ts` already binds them to `installation-owner`, but no route serves them: the workers view and token issue exist only as CLI commands, tokens are stored by hash without an identifier, and nothing lists, revokes, or rotates a token. The screens of changes 33a and 33b need the five operations over HTTP.

## What Changes

- `enrollment_tokens` gains `token_id` (backfilled for existing rows, then `NOT NULL UNIQUE`), `revoked_at`, and `replacement_token_id`; no row is deleted. A token's domain record carries its `tokenId`, and `IdentifierSource` mints it as `e` and 32 hexadecimal digits.
- `FleetRegistry` gains `pendingTokens`, `tokenById`, `revokeToken`, and `rotateToken`, in the PostgreSQL and in-memory adapters, with conformance cases. A redemption refuses a revoked token: `unusedToken` and `enroll` read only tokens that are not revoked, and the service answers `token-invalid`.
- A new `EnrollmentTokenService` in `@taskelith/fleet` issues, lists, revokes, and rotates tokens; `EnrollmentService.issueToken` mints through it, so the CLI bundle is unchanged.
- Five routes and a `FleetApi` handler: `listWorkers` maps `WorkerAdmissionView.workers()` with every detail redacted again; the token's secret appears only in the 201 of issue and rotate; `ApiServices.fleet` and the composition wire them.
- Spec deltas: `control-plane-api` (the served operations and the refusals of the commands) and `installation-enrollment` (a revoked token is `token-invalid`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `control-plane-api`: the five operations served with their roles, refusals, one-time reveal, and re-redaction.
- `installation-enrollment`: single-use enrollment refuses a revoked token.

## Impact

Private workspace packages only (`@taskelith/fleet`, `@taskelith/postgres`, `@taskelith/secrets`, `@taskelith/control-plane`, and tests); the published `taskelith` package is unchanged, so the commit types are `chore`, `test`, and `docs`. No OpenAPI change. Size M. Not in this change: audit events for token commands (follow-up), per-worker reachability and capacity in the view (contract change, follow-up), the screens of 33a and 33b, and worker revocation or rotation over HTTP, which stay CLI commands.

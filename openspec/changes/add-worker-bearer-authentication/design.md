## Context

A worker presents its control-plane secret as an HTTP bearer, without its worker identifier (`execution.openapi.json`, scheme `workerCredential`). Item 13 stores each generation's hash in the worker's enrollment record, which is JSON text, so the only lookup was by worker identifier. Secrets are 256 random bits, and their stored form is a plain SHA-256 (D10 a), so the hash of a presented secret is a lookup key.

## Coordinator decisions (2026-10-25)

These are coordinator decisions, taken as the worker recommended.

- **A1 (a): a predecessor within its grace window authenticates.** This matches the trust model's grace window and item 13's rotation. The principal carries the generation it authenticated with, so a later operation can apply a stricter rule.
- **A2 (a): hash columns on `workers`.** The columns are `control_plane_hash` and `previous_control_plane_hash`, both unique. All four writers maintain them, and the migration backfills them from the enrollment record.
- **A3: one redacted refusal.** An unknown credential, a revoked worker, and a credential past the grace window are all 401 `forbidden`, with reason `worker-not-authorized` and no detail about which case applied. A request with no bearer at all keeps the server's existing 401, as for every scheme.
- **A4: the server authenticates.** `authenticateWorker(bearer)` answers a `Result<WorkerPrincipal>` before the operation runs, as `operatorToken` does, and the principal travels on `ApiRequest`.

## Goals / Non-Goals

**Goals:**
- the lookup by hash;
- the bearer authentication with the grace-window and revocation rules;
- the scheme branch in the server.

**Non-Goals:**
- `authorizeLaunch`, with its in-transaction re-check of the worker (item 17);
- `publishEvidence` (item 19);
- a worker-side client (item 17).

## Decisions

- **The registry returns the record, and the service decides.**
  - `workerByCredentialHash` returns a revoked worker, and a predecessor whose grace window has passed but which the sweep has not dropped yet.
  - The service applies `validGenerations` at its clock's `now` and then compares in constant time with `Secrets.matches`.
  - So the rules stay in one place, the same as for rotation.
- **The columns follow the record.**
  - `#write`, which rotation, revocation, and predecessor expiry all use, sets both columns from the record it writes. Enrollment sets the current one.
  - A dropped predecessor's hash leaves the index.
  - A revoked worker keeps its hashes; revocation is decided from the record.
- **The backfill masks escapes before `jsonb`.** A stored record may hold escapes that `json` and `jsonb` reject, such as a lone surrogate or NUL in a host name. As in the signals migration, the backfill masks every escape first. A hash is hexadecimal, so the mask leaves it intact. The migration test stores such a record.
- **A read-only lookup, and a point-in-time check.** The lookup runs in its own REPEATABLE READ transaction, so the read on every worker request does not take part in serializable conflict detection with writers. A credential can be revoked, or a predecessor dropped, between the check and the operation's write. So every operation that writes on a worker's behalf re-reads the worker in its own transaction:
  - item 17: `authorizeLaunch` re-reads the worker and applies the contract's rule "enrolled, unrevoked, at its current credential generation" ([launch authorization](../../../docs/contracts/launch-authorization.md) section 2) to the principal's generation;
  - item 19: `publishEvidence` re-reads the worker, since revocation denies observation writes at once (trust model section 4);
  - the item that implements `requestDelegation` does the same.
- **Unique columns, and a shared hash fails closed.** A collision of two random 256-bit secrets is not expected. Within a column, the unique constraint refuses the second write. One hash could still be current for one worker and predecessor for another. The lookup then answers `internal` in both adapters, so it authenticates neither worker.
- **Fixed statuses for authentication.** A refused credential is 401 and a store that is down is 503, whatever a route's own status table declares, for the operator and worker schemes alike.
- **A replaceable route table.** `ApiServerOptions.routes` defaults to `ROUTES`. No route of the server's table uses the scheme yet, so the test serves a probe route with it. The contract already declares it for `authorizeLaunch` (item 17), `publishEvidence` (item 19), and `requestDelegation` (items 20 and 21).

## Risks / Trade-offs

- The bearer is checked before the body is read. A refused credential costs one indexed read, the same as the operator check.
- The fleet test fixture's control-plane hash now names its worker (`cp-<worker>-<generation>`), so two workers in one conformance case do not collide on the unique columns.

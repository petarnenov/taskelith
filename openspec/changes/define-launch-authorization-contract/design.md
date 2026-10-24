## Context

Architecture sections 6 and 9, the trust model's `launchAuthId`, the operational targets (`TTL 30s`, skew `5s`), invariant 13, F17, R27, and G2 decisions D7 (c) (per-execution supervisor) and D12 (a) (HTTPS launch operation) constrain the contract. Items 4, 5, and 6 define the execution identity, the journal, and capacity reservations in parallel; this contract names them by item and fixes only what launch authorization needs from them.

## Decisions

1. **`SERIALIZABLE` transactions for ordering.** The authorization and every transaction that changes a compared value run at PostgreSQL `SERIALIZABLE` isolation. Serializable snapshot isolation guarantees a serial order between them without a hand-written lock order across gates, policies, and reservations; retries on serialization failure keep the same `operationId`. Alternative: row locks on the attempt in every writer, rejected because policy and gate changes affect many attempts and the lock order would be easy to break.
2. **Invalidation after the transaction writes a cancellation in the same transaction.** This makes "after" observable and leaves no window in which an authorization is known to be stale but nothing acts on it.
3. **Monotonic deadline measured from before the request.** The worker's deadline is its monotonic reading before sending plus `ttl` minus `skew`; since that reading precedes the server's `issuedAt`, the worker's deadline cannot pass the server's expiry, and wall-clock changes do not affect it.
4. **Server-side safety through single use.** An authorization covers one execution and one start; a start without a granted authorization becomes an `unauthorized-start` fact that is cancelled and reconciled. Safety therefore does not depend on the worker's clock alone.
5. **Idempotency by `operationId`.** Transport retries return the recorded result; re-authorization uses a new `operationId` and a full check, so a stale result is never reused after expiry.
6. **Rejection reasons are explicit and classed as retryable or not**, so the worker and scheduler react without parsing text; item 8 turns them into the OpenAPI schema.

## Risks

- `SERIALIZABLE` increases retries under contention. Item 17 measures it; the 1000-worker stage (G7) may revisit it with measurements.
- Items 4, 5, and 6 may refine names (`executionId`, launch record, reservation); the contract follows their final wording when they merge.

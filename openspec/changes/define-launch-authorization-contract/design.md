## Context

Architecture sections 6 and 9, the trust model's `launchAuthId`, the operational targets (`TTL 30s`, skew `5s`), invariant 13, F17, R27, and G2 decisions D7 (c) (per-execution supervisor) and D12 (a) (HTTPS launch operation) constrain the contract. Items 4, 5, and 6 define the execution identity, the journal, and capacity reservations in parallel; this contract names them by item and fixes only what launch authorization needs from them.

## Decisions

1. **`SERIALIZABLE` transactions for ordering.** The authorization and every transaction that changes a compared value run at PostgreSQL `SERIALIZABLE` isolation. Serializable snapshot isolation guarantees a serial order between them without a hand-written lock order across gates, policies, and reservations; retries on serialization failure keep the same `operationId`. Alternative: row locks on the attempt in every writer, rejected because policy and gate changes affect many attempts and the lock order would be easy to break.
2. **Invalidation after the transaction writes a cancellation in the same transaction.** This makes "after" observable and leaves no window in which an authorization is known to be stale but nothing acts on it.
3. **Monotonic deadline measured from before the first request.** The worker's deadline is its monotonic reading before the first request of an `operationId` plus `ttl` minus `skew`; the reading precedes the server's `issuedAt`, wall-clock changes do not affect it, and retries keep the first reading. A restart loses the reading, so a journaled authorization is never used after a restart.
4. **Server-side safety through single use and ownership.** The server cannot observe the spawn time, so under the trusted-host boundary the worker's deadline enforces it. The server enforces single use per execution, ownership that expiry does not release, revocation, and `unauthorized-start` for starts it cannot attribute. Start observations are decided by authorization and execution, not arrival time, so a timely start reported after an outage stays a start.
5. **Idempotency by `operationId`, with replay re-checking revocation.** Transport retries return the recorded grant only while it is still granted and the quarantine state, epoch, and credential are current; re-authorization uses a new `operationId` and a full check.
6. **Rejection reasons map one-to-one to checks**, each classed as retryable or not with the scheduler's action, so the worker and scheduler react without parsing text; item 8 turns them into the OpenAPI schema.
7. **Admission staleness through comparison only.** A `used` admission is never invalidated in the G1 model, so the authority compares its gates, revisions, and policy revision with the current state instead of adding an admission state.

## Risks

- `SERIALIZABLE` increases retries under contention. Item 17 measures it; the 1000-worker stage (G7) may revisit it with measurements.
- Items 4, 5, and 6 may refine names (`executionId`, launch record, reservation); the contract follows their final wording when they merge.

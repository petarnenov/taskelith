## Context

Architecture sections 5, 8 ("Resource admission and delegation"), 9, and 14 (R32), F22, the operational targets section 1, the trust model, ADR 0005, and the merged launch authorization contract constrain the contract. Items 4 and 5 define the supervisor and the journal in parallel; this contract names them by item and fixes only what capacity reservation needs from them.

## Decisions

1. **One `SERIALIZABLE` transaction for reservation, assignment, and outbox command.** It is the isolation the launch authorization contract already uses, so a reservation, a release, and an authorization are ordered among each other without a hand-written lock order across workers, projects, runs, and budgets. Scheduler replicas keep no in-memory counters and re-check every budget inside the transaction; a uniqueness constraint on held reservations per attempt backs the serial order. Alternative: `SELECT ... FOR UPDATE` on counter rows, allowed as an implementation of the derived occupancy but not as a replacement for serializable ordering against releases and authorizations.
2. **Occupancy and consumption are separate.** Slots, resources, quotas, and credential units return on release; delegation attempts and automatic retries are charged once and never refunded, so a retry loop or a delegating agent cannot regain budget by ending attempts.
3. **Release only through a closed list of lifecycle facts.** An exited or sealed `not-started` execution, an assignment that ended with no grant ever issued, or an audited operator reconciliation. Loss of contact, revocation of a worker, expiry, cancellation requests, restarts, and lowered quotas release nothing, so uncertainty is never free capacity.
4. **Release stays an invalidating writer of the launch authorization contract.** The names `capacity-not-reserved` and "still held for this attempt on this worker" are kept unchanged; the contract defines them precisely (state `held`, same attempt, same worker).
5. **Delegation budget keyed by the root task from the persisted parent link.** The parent is derived from the authenticated delegating attempt. "Max total attempts per root task: 8" is read as every attempt in the tree, including the root's own attempts and retries, because reading it as children only would let retries of the root escape the shared budget. Depth counts levels below the root, which has depth 0.
6. **Provider concurrency at attempt granularity.** A credential's limit of concurrent requests or turns is reserved as one unit per attempt that uses it; turn-level limits inside an attempt stay with the harness plugin in G3. This gives a check G2 can implement with no credential in use and that G3's account pool selection plugs into.
7. **Worker limits are enforced locally as well.** The worker's journal is authoritative for what runs on it, so it refuses work beyond its slots, ceilings, disk floor, journal backlog, and daemon overhead even when the scheduler's view was stale; an unmeasurable value counts as exceeded.
8. **Hard controls fail closed at both ends.** The scheduler places only on workers declaring every hard control, and the worker and supervisor refuse when a control cannot be applied; hard spend limits are rejected until a provider enforces them.

## Risks

- Holding capacity for uncertain attempts can stall a project until an operator reconciles; item 22 makes the held uncertain capacity visible.
- `SERIALIZABLE` reservations add retries under contention; item 18 measures them, and the 1000-worker stage (G7) may revisit the scheme with measurements.
- The fairness order is left to item 18 beyond the quotas and the stated default.

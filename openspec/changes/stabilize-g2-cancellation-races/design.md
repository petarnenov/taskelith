## Context

`ObservationService.apply` ran each observation in one SERIALIZABLE transaction that authenticated the producer, recorded contact with `WorkerReports.recordContact`, accepted the inbox entry, and applied the effect, the cursor, and any confirmation (base `6dab1d26`: `apps/control-plane/src/application/observation-service.ts:79`, `:163`). `recordContact` is `UPDATE workers SET reachable = true, last_contact_at = greatest(last_contact_at, $2)` (`packages/adapters/postgres/src/observation-repositories.ts:100`). Heartbeats (`HeartbeatService`), inventory reports, and the lost-contact check write the same row. Two writers of one row under SERIALIZABLE cannot both commit: the later one waits for the row lock and then fails with `could not serialize access due to concurrent update`, and `PostgresDatabase` runs it again up to five times (`SERIALIZATION_ATTEMPTS`).

In the G2 scenarios a worker sends a heartbeat every 500 ms. An observation whose effect never touches the `workers` row, such as `execution.started`, still lost to them. Under load, five losses in a row exhausted the retries, the consumer redelivered about 15 s later, and e and h ran out of their 20 s wait for the start.

## What the in-transaction contact protected

Decision 1 of `2026-10-25-implement-observation-consumption` put contact in the observation's transaction, and decision 12 of `2026-10-26-add-worker-heartbeat` moved it before the inbox so a duplicate counts too. The archived designs give no invariant that needs it atomic with the effect. Each candidate:

1. **Fail-closed after a journal loss.** `retireJournal` makes the worker unreachable until a new incarnation (`inventory-reconciliation` "Journal retirement after a rollback"); a retired journal's observations and heartbeats are not authenticated. Inside one transaction, contact came first and a snapshot rollback's retirement after it, so the worker ended unreachable. A contact recorded later must not undo that, so the moved write authenticates again with `isCurrentProducer`, as a heartbeat does. A retirement that commits first leaves no contact; one that commits later wins as before. The same check refuses contact for a worker revoked meanwhile (`launch-reconciliation`).
2. **Ordering against `fleet.worker.contact-lost`.** The lost-contact check marks a worker whose last contact is older than the cutoff. Between an observation's commit and its contact the check can mark the worker, and the contact then makes it reachable again, as any heartbeat does ("Contact while the check runs" in `worker-contact`). Reachability affects only placement (`worker-contact` "Lost contact"; architecture section 5, invariant 4), and no observation effect reads `reachable` or `last_contact_at`: the effects write capacity, pressure, refusal, and protocol fences, which stay in the effect's transaction.
3. **A lost-contact to reachable transition the effect depends on.** None: no effect, journal replacement, or reconciliation reads reachability, and placement runs in its own pass. A worker whose new incarnation replaced its journal becomes reachable at the contact after the commit.

No invariant needs the rule, so no part of the contact stays in the effect's transaction.

## Decisions

1. **Contact after the commit.** `apply` consumes the observation and, when that answers `ok` (applied, rejected, or duplicate), runs `recordCurrentContact` in a transaction of its own: the producer must be current, enrolled, not revoked, and under its enrolled, unretired journal, and then `recordContact` moves `last_contact_at` to that transaction's database time with `greatest`, so it never moves backward. `HeartbeatService` uses the same function and keeps its `forbidden` answer.
2. **Failure is logged.** A failed contact transaction is logged as `execution.observation.contact-unrecorded` with the observation's correlation (`workerId`, `observationId`, `correlationId`) and the failure's `type`, `code`, and `message`, as `execution.inventory-request.failed` does; the logger redacts secret fields. `apply` still answers the consumed outcome, so the consumer acknowledges the observation and does not redeliver it. The worker's next heartbeat, within `10s`, records contact instead.
3. **Paths that are not consumed.** An unsupported type or an unauthenticated producer keeps its own contact transaction (decision 3 of the 21b design), whose failure is still returned, since the observation is redelivered anyway. A rollback records no contact. An `unavailable` or `internal` failure records none and is redelivered.
4. **Revoked producer.** Its observation is still logged as `execution.revoked-worker.observation` inside the transaction, and `isCurrentProducer` refuses its contact.

## Risks / Trade-offs

- An observation now commits before its worker turns reachable. A newly enrolled worker's first declaration therefore makes it eligible for placement one short transaction later; a failed contact leaves it unreachable until its next heartbeat.
- Observation effects that write the `workers` row, such as capacity declarations and the capacity refusal fence of exits, still contend with heartbeats. They run less often than `execution.started` and keep their fences atomic with the effect.
- `InventoryService` records contact inside the inventory report's transaction in the same way (`apps/control-plane/src/application/inventory-service.ts:51`). It is outside this change and listed as a follow-up.

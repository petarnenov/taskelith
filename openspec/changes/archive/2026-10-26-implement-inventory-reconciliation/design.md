## Context

21b runs the observation consumer: `ObservationService` authenticates each observation, deduplicates it through the inbox, classifies its sequence against the producer cursor, records first contact, applies its effect, and confirms the contiguous prefix. Anything it does not consume returns `not-consumed` and reaches quarantine: inventory reports fail `parseObservation` before contact, because they carry no `ObservationMetadata`; the uncertainty, unproven termination, unrecorded process, and unapplied cancellation types have no entry in `OBSERVATION_EFFECTS`; and a sequence classified `rollback` or `new-incarnation` is refused, the latter at authentication, because `metadata.journalId` must equal the journal fixed at enrollment.

The domain already has what reconciliation needs: `recordExecutionEvidence` for `uncertain`, `termination-unproven`, and `local-history-lost`; `canResendAssignment`, which holds while no grant was ever recorded for the attempt; and the placement charge, which gives an attempt with an unknown execution no retry. `execution.asyncapi.json` 0.3.0 already declares `worker.inventory.requested` and `worker.inventory.reported`, and the NATS receiver already deduplicates a report part by `reportId.part`.

## Decisions recorded for 21c

- **Coordinator decisions for item 21 (2026-10-25), still in force:**
  - Q2 (a): any authenticated observation or inventory report counts as first contact.
  - Q4 (a): each module keeps its tables behind its own ports, and `check-boundaries` stays green.
  - Q6 (a): tests seed `authorizedUnder` grants until 21d.
- **Coordinator decisions for 21c (2026-10-25):** G1 to G12 and R1, recorded below as the decisions that carry them.

## Goals / Non-Goals

**Goals:**
- request inventory and record its bound;
- apply inventory snapshots, with the rollback check of a fresh snapshot and the omission rules;
- accept a new journal incarnation, retire a rolled-back journal, and reconcile the assignments that lost their local history;
- consume uncertainty, unproven termination, unrecorded processes, and unapplied cancellation;
- re-send an offer unchanged;
- record first contact from an inventory report.

**Non-Goals:**
- the observation types and revoked workers of 21d (proposal);
- deciding an uncertain execution's outcome, which evidence or an operator does;
- the worker's side of inventory and incarnations (items 20 and 24);
- any wire contract schema change; the only contract text change is the inventory request rule of wire contracts section 6, which the coordinator approved (decision 4).

## Decisions

1. **Confirmation by sequence (coordinator decision G1).** The cumulative confirmation of wire contracts section 6 was delivered by 21b and is recorded as met; 21a's proposal, which listed it for 21c, is stale on this point. This change adds no confirmation rule.

2. **New journal incarnation (coordinator decision G2, security-relevant).** An observation or inventory report whose `journalId` differs from the worker's enrolled journal is handled in its transaction, before the inbox:
   - **Revoked worker.** Not consumed, as in 21b; 21d consumes it. Its new journal never replaces the enrolled one.
   - **Seen journal.** A journal the control plane has seen from the worker before, which is any journal with a `producer_cursors` row of that worker, retired or not, is refused: not authenticated, logged as `execution.journal.refused` with the worker and the journal, and not applied.
   - **Unseen journal of a worker that is not revoked.** It replaces the enrolled journal:
     1. `WorkerDirectory.replaceJournal(workerId, previousJournalId, journalId)` writes the new journal under SERIALIZABLE. It fails with `conflict` when the enrolled journal is no longer `previousJournalId`, or when another worker's enrolled journal is `journalId`, which the unique `journal_id` column refuses; the report or observation is then refused.
     2. The previous journal's cursor is retired (decision 3), and created retired when it has no row, so that it counts as seen.
     The worker's report fences (capacity, pressure, refusal, protocol) restart at no sequence in the same transaction, because the new journal's sequences restart at 1; an author fix found during implementation.
     3. The replacement is logged as the structured warning `execution.journal.replaced` with the worker, `previousJournalId`, and `journalId`.
     4. Every unfinished assignment of the worker is reconciled as having lost its local history (decision 9).
     5. The message then continues as one of the enrolled journal, starting a new cursor.
   - **Facts derived again.** A new incarnation reports surviving facts again, and the worker's acceptance of a re-sent offer keeps its `commandId`, so its `observationId` is one the inbox already holds (worker journal line 117). Deduplicating the fact is separate from recording its position: a known identity at a sequence the journal has not applied records that sequence in the journal's cursor, confirms the grown prefix, and evaluates the pending snapshots, without applying its effect again; otherwise the new cursor would keep a permanent gap. A known identity at an applied sequence stays 21b's repeat, which confirms the prefix again when within it; no identity is kept per sequence, so the sequence check finds a rollback only under a new identity, as before (review pass 1, H1).
   - **Required tests.** A previously seen journal is refused and changes nothing; a revoked worker's unseen journal is refused and does not replace the enrolled one; a journal another worker holds is refused.
   - **Why it is safe.** The subject's worker must equal the message's worker, and the per-worker broker permissions restrict the subject, so only the worker's own credentials can present a journal. A journal seen before is refused, so a restored journal can never return.

3. **Journal retirement after a rollback (coordinator decision G3).** A sequence classified `rollback` (worker journal line 160), or a fresh snapshot that fails its rollback check (decision 6), retires its journal as a journal loss:
   - The transaction sets the cursor's `retired_at`, calls `WorkerReports.recordJournalLoss(workerId)`, which makes the worker unreachable so that placement offers it nothing, and logs `execution.journal.retired` with the worker, the journal, and the cause.
   - For a sequence rollback, the retirement commits in a transaction of its own, as 21b's first contact of an unconsumed observation does, and the observation is then not consumed. A rolled-back snapshot is never applied. Pending snapshot parts of the journal are discarded.
   - That transaction reads the worker's enrolled journal again and re-checks the rollback. When a new incarnation replaced the journal in between, it changes nothing: the replacement already retired the old journal and discarded its parts, and the old journal must not make the new incarnation unreachable. A fresh snapshot's rollback retires its journal in the transaction that found it, so it needs no re-check (review pass 1, M2).
   - Every later observation or report of a retired journal is refused as not authenticated, records no contact, and reaches quarantine, as 21b's unauthenticated observations do.
   - The worker stays fail-closed until a new incarnation replaces the journal (decision 2), whose reconciliation then covers every unfinished assignment. Ownership and reservations are kept meanwhile (worker journal section 11).
   - Refusing launch authorization to such a worker is 21d's.

4. **Inventory requests (coordinator decision G4).** `InventoryService.request(tx, workerId)` stores a request and appends `worker.inventory.requested` to the worker's command subject:
   - The `requestId` comes from an identity source injected into the service: `crypto.randomUUID()` in the composition root, deterministic in tests. The outbox event identity is `i` followed by the `requestId`. The payload carries the worker's protocol version, or this build's when it has none, as a confirmation does.
   - **(a) Unsolicited snapshot.** When the first stored part of a report has no `requestId`, or one that is not the worker's current request, the transaction also requests inventory. A report is the worker's reconnect signal (wire contracts line 74), and the fresh answer carries the new `requestId`, so it requests nothing more.
   - **(b) Start.** At control-plane start, the composition root requests the inventory of every active worker once, each in its own transaction: one pass, at most one request per worker, a failure logged as `execution.inventory-request.failed` and not retried, and a summary `execution.inventory-requests.sent` with the worker and failure counts. This follows 20b's command consumer repair. It reads the workers through a port with `FleetRegistry.activeWorkerIds()`, which arrives with 20b; if 20b is not in `dev` when this change is implemented, this change adds that method with 20b's exact signature, and the second merge keeps one.
   - An omission that a snapshot without the current `requestId` cannot classify also requests inventory (decision 8). A fresh snapshot's unclassified omission requests nothing, because it already answers the latest request, and a request after it would repeat while the worker has not received the offer. The re-sent offer (wire contracts line 78) covers that case. On 2026-10-25 the coordinator approved amending the wire contracts' inventory request text to say so (a text change only, with no schema change).

5. **Request bound (coordinator decision G7).** `InventoryRequests` stores, per worker, only the latest request in `inventory_requests` (Execution, beside `producer_cursors`), keyed by `worker_id`: the `requestId`, the time, and the bound. An upsert replaces an earlier request.
   - The bound lists each journal of the worker, from `ProducerCursors.listByWorker(workerId)`, with the highest sequence applied from it (the larger of `confirmedThrough` and the highest sequence above it) and the unfinished assignments whose acceptance was applied from it (decision 10).
   - An observation applied after the request does not change the bound.

6. **Rollback check.** A snapshot is fresh when its `requestId` is the worker's current request. Once a fresh snapshot is complete, before any other rule, it is checked against the bound of its journal:
   - a `throughSequence` below the bound's sequence is a rollback;
   - so is the omission of an unfinished assignment the bound lists for that journal;
   - a journal absent from the bound has nothing to check.

   A rollback retires the journal (decision 3). The check needs no observation through `throughSequence`: the bound only names what was already applied.

7. **Pending snapshots (coordinator decision G5).** `InventoryReports` keeps the parts in `inventory_report_parts` (Execution), keyed by `(report_id, part)`, with the worker, the journal, the `requestId`, `snapshot`, `parts`, `throughSequence`, and the part's assignments and executions.
   - **Receipt.** A part is first checked against the stored parts of its report (Consistency below), before any other rule. The journal's highest received `snapshot` is the larger of `producer_cursors.reported_snapshot` and the `snapshot` of every pending part. A part of a non-fresh report below it is discarded; otherwise the part is stored. A fresh part is stored whatever its `snapshot` (wire contracts line 76). `reported_snapshot` grows only to the `snapshot` of a report that the arriving part completes, so that a part later found inconsistent leaves no watermark behind; a pending part still counts through its own `snapshot`, and is gone once its report is refused, which keeps the lower-`snapshot` filter of line 76 for every part received and not refused (review pass 2, M5).
   - **Evaluation.** A complete snapshot is evaluated after each stored part and after each cursor advance of its journal, in the transaction that caused it: the rollback check if fresh; then the lower-`snapshot` filter, which discards a snapshot below the journal's highest received `snapshot` as receipt defines it; then, once the cursor's `confirmedThrough` reaches `throughSequence`, the snapshot is applied (decision 8) and its parts are deleted.
   - A snapshot that waits for the cursor stays stored; nothing is negatively acknowledged until ready.
   - **Consistency.** Every part of a report must agree on `parts`, `workerId`, `journalId`, `requestId`, `snapshot`, and `throughSequence`, and the part numbers must lie within 1 to `parts`; a report is complete only with every one of them. A report whose parts disagree can never be applied, so the receipt of the part that reveals it deletes the report's stored parts and stores nothing, without raising the watermark, pruning, or requesting inventory, and logs the structured warning `execution.inventory.refused` with the worker, the journal, the `reportId`, and the reason `inconsistent-parts`; that part is consumed, like any other part. Stored parts therefore never disagree (review pass 1, M3; review pass 2, M5).
   - **Bound.** After each stored part and after each new request, a journal keeps only its newest fresh report and its newest report that is not fresh, the latter only while its `snapshot` is not below the journal's highest received; newest is the highest `snapshot`, and the arriving part's report wins a tie. The fresh report kept has its rollback check when it completes. A worker can answer one request with several reports, for example after a redelivered request, so fresh reports are bounded too. A report that a new request makes no longer fresh is deleted once a later snapshot was received. The table holds, per worker, at most one fresh report and one report that is not fresh, because only the enrolled journal keeps parts (review pass 1, M4; review pass 2, M6).

8. **Applying a snapshot (coordinator decision G11).** A snapshot changes only omission handling, the rollback check, and contact; it never changes an execution's state, and records evidence only through decision 9; what the snapshot reports about its executions is not applied. For each unfinished assignment of the worker that the snapshot omits:
   - **Lost local history.** When its acceptance was applied from the snapshot's journal at a sequence up to `throughSequence`, or from an earlier journal of the worker, the assignment is reconciled (decision 9).
   - **Unclassified.** Otherwise the worker may not have received the offer: it is re-sent (decision 12) only while `canResendAssignment` holds, and nothing else is concluded. A snapshot without the current `requestId` also requests inventory once (decision 4).
   - An assignment the snapshot lists, and one of another worker, are left unchanged.

9. **Reconciling lost local history (coordinator decision G2).** For an assignment whose worker lost its local history, in the transaction that found it:
   - while `canResendAssignment(task, attemptId)` holds, no grant was ever recorded, and the offer is re-sent (decision 12);
   - otherwise `local-history-lost` is recorded with `recordExecutionEvidence` on every execution under the assignment that is not terminal and does not carry it yet. Such an execution is unknown, so the attempt cannot end and its retry budget is `0` (worker journal line 184).

   Ownership and the reservation are kept, and the outcome is left to evidence or an operator.

10. **Acceptance provenance (coordinator decision G6).** The acceptance effect records the journal and sequence of the applied acceptance in the assignment, stored in the new columns `assignments.accepted_journal_id` and `assignments.accepted_sequence`. The migration backfills nothing: an assignment accepted earlier has no provenance, so its omission is unclassified, and a new incarnation still reconciles it. `AssignmentRepository.listUnfinishedByWorker(workerId)` lists the worker's assignments that have not ended, in identifier order.

11. **Inventory report authentication (coordinator decision G12).** `InventoryService.apply(message)` runs each part in one SERIALIZABLE transaction:
    1. Authenticate: the subject's worker equals `workerId`, the worker is enrolled and not revoked, and `journalId` is its enrolled journal and not retired, or an unseen journal that replaces it (decision 2). Anything else is refused as not consumed and reaches quarantine.
    2. Accept the part in the inbox under the consumer `control-plane-observations` with the identity `reportId.part`. A `duplicate` ends the transaction with no effect. There is no inbox entry beyond it and no confirmation, because a report is outside the journal sequence.
    3. Record first contact through `WorkerReports.recordContact`, once per part.
    4. Store or discard the part, request inventory for an unsolicited report, and evaluate the snapshot (decision 7).

    The composition root routes `worker.inventory.reported` from the observation consumer to `InventoryService`, and every other type to `ObservationService`.

12. **Re-sent offer (coordinator decision R1, from item 20b).** A re-sent offer republishes the stored command unchanged:
    - The outbox finds the offer's stored message by the assignment's `offerCommandId` through a new lookup by event identity.
    - A new outbox row is appended with a fresh event identity and the stored subject and payload unchanged, so the `commandId` and `issuedAt` stay the same. A new `issuedAt` would be a conflict at the worker, whose inbox digest covers the whole command with sorted keys.
    - The fresh identity is `r` followed by the SHA-256 of the `commandId` and its cause: the `reportId` of the snapshot, or the new `journalId` of an incarnation. A serialization retry reuses it, and the publisher sends it with its own `Nats-Msg-Id`.
    - It is re-sent only while `canResendAssignment` holds. Until 21d, tests seed the grants that make it false (Q6 (a)).
    - An assignment without an `offerCommandId`, or whose offer row is gone, is not re-sent; this is logged as `execution.offer.not-resent`.

13. **Unrecorded process (coordinator decision G8).** `execution.unrecorded-process` is applied with no domain effect: its sequence is recorded and confirmed, and it is logged as the structured warning `execution.unrecorded-process` with the worker, the containment, and the process count. It never counts as current work. A worker-level record is left to 21d's reconciliation queue.

14. **Cancellation not applied (coordinator decision G9).** `execution.cancellation.not-applied` records the new evidence kind `cancellation-not-applied` on its execution with `recordExecutionEvidence`. The execution stays `started`, and the attempt's cancellation request stays pending, so the execution's later terminal fact still ends the attempt. Unlike the other kinds, this evidence does not make the execution unknown, because the process set is known; only its signal failed.

15. **Uncertainty and unproven termination (coordinator decision G10).** `execution.uncertain` and `execution.termination-unproven` record their evidence kinds with `recordExecutionEvidence`. A `termination-unproven` after an exit keeps the domain's rejection, so the observation is `rejected` and confirmed. The stale-generation check of 21b decision 5 applies to all three execution evidence types.

16. **Inventory request without `Nats-Msg-Id`.** The outbox publisher sends `worker.inventory.requested`, like `execution.observations.confirmed`, without a `Nats-Msg-Id` header (wire contracts section 2), because only the latest request matters and two requests are never duplicates.

17. **Persistence (coordinator decision Q4 (a)).** One migration, `1792932300000_inventory-reconciliation.sql`, adds `inventory_requests` and `inventory_report_parts`, the columns `retired_at` and `reported_snapshot` of `producer_cursors`, and the acceptance columns of `assignments`. Each new port has an in-memory adapter, a conformance suite, and a PostgreSQL adapter wired into `PostgresTransaction` and `ControlPlaneTransaction`, as `producer_cursors` is. The new tables join the test database's table list.

## Risks / Trade-offs

- **Fail-closed worker.** A worker whose journal was retired stays unreachable until an operator starts a new incarnation. A false rollback is impossible by the sequence check, which needs a new identity at an applied sequence, but the worker stops working until the operator acts.
- **No provenance before the migration.** Assignments accepted before this change cannot prove lost history from an omission; only a new incarnation reconciles them. G2 has no deployed installation.
- **Startup requests.** Every start requests every active worker's inventory, and every report answering them is evaluated. The fleet of G2 is small.
- **Unclassified omissions.** An omitted assignment whose acceptance came after `throughSequence` is re-sent while no grant exists, which the worker's inbox makes a duplicate.

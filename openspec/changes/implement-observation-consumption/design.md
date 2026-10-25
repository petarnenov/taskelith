## Context

Item 12 delivered the observation stream, a validating durable consumer (`observationConsumer`), and receiver deduplication (`applyOnce` over the `Inbox` port), but no control-plane code runs them. The execution domain already has the facts (`recordExit`, `recordNotStarted`, `endAttempt`, `taskOutcomeFact`) and the producer cursor (`classifyObservation`, `recordAppliedSequence`). The scheduling domain already has `acceptAssignment`, `refuseAssignment`, and `releaseInTransaction`. Item 18's ledger has `closeDelegation`. None of these runs in production yet. Item 17 records each grant in the task, so an exit names an execution the task knows.

## Decisions recorded for 21b

- **Coordinator decisions for item 21 (2026-10-25), from 21a:**
  - Q2 (a): any authenticated observation counts as first contact.
  - Q3 (a): the release outcome is `Result<{ outcome: 'released' | 'kept', assignment }>`.
  - Q4 (a): `producer_cursors` belongs to Execution behind its own port.
  - Q6 (a): tests seed grants until 21d.
  - Sequence gaps: observations past a gap are applied, and only the confirmation is held.
- **Coordinator brief for 21b (2026-10-25).**
  - It names every 21b obligation listed in the proposal.
  - Any change to the wire contracts goes through the coordinator; this change makes none.
  - Every observation type that is not consumed names the change that consumes it.
- **Owner decisions (2026-10-25), given to the worker directly:**
  - This change also consumes capacity declarations and admission pressure, with ineligibility after a capacity refusal.
  - Every exit ends its attempt.

## Goals / Non-Goals

**Goals:**
- consume acceptance, refusal, command rejection, exit, not-started, capacity declaration, and admission pressure;
- persist the producer cursor and send the confirmation;
- record first contact;
- end attempts and release, close delegations, and retry automatically;
- reject observations at a stale ownership generation;
- end an attempt that placement rejects.

**Non-Goals:**
- the observation types and sequence classes of 21c and 21d (proposal);
- lost-contact timeouts (items 20 and 24);
- an operator-configured capacity below the declared one.

## Decisions

1. **One transaction per observation.** `ObservationService.apply(message)` runs at SERIALIZABLE, in this order:
   1. Authenticate.
   2. Accept the observation in the inbox under the consumer `control-plane-observations`. A `duplicate` ends the transaction as a duplicate; the consumer acknowledges it.
   3. Classify the sequence against the stored cursor.
   4. Record first contact.
   5. Apply the effect.
   6. Record the sequence in the cursor.
   7. Append a confirmation when `confirmedThrough` grew.

   The handler answers `ok` only after the commit. An `unavailable` or `internal` failure rolls everything back, and the consumer redelivers.
2. **Authentication.**
   - The worker of the subject must equal `metadata.workerId`. The per-worker broker permissions already restrict the subject.
   - The worker must be enrolled and not revoked.
   - `metadata.journalId` must equal the worker's enrolled journal.
   - Any other observation is not authenticated. It is not applied, and the transaction rolls back.
   - An observation of a revoked worker is left to 21d. One of another journal is a `new-incarnation`, which is 21c's.
3. **Not consumed.** These are not applied and return the failure `precondition-failed` with the reason `not-consumed`:
   - an observation of a type that 21c or 21d consumes;
   - a sequence classified `rollback` (21c);
   - an unauthenticated observation.

   For an authenticated one, first contact is first committed in a transaction of its own (Q2). After `max_deliver` deliveries the consumer quarantines the observation. No sequence is recorded, so the gap holds the confirmation and the worker keeps the entry. Its consuming change redrives it from quarantine, and the worker's republication repeats it.
4. **Applied or rejected.** A consumed, authenticated observation whose effect the domain refuses is recorded as applied with no effect: `rejected`, logged with its reason.
   - Domain refusals are `conflict`, `precondition-failed`, `forbidden`, and `not-found`.
   - Its sequence and inbox record commit, so the confirmation moves past it.
5. **Stale generation.** An observation about an attempt finds its task through `AssignmentRepository.listByAttempt(attemptId)`.
   - It is `rejected` with `stale-ownership-generation` when `metadata.ownershipGeneration` differs from the task's ownership generation.
   - An acceptance or refusal is also rejected when that generation differs from its assignment's.
   - **Why it is safe.** The generation only moves past an attempt through `openAttempt` and `claimOwnership`, which require that no execution of the attempt can run. A stale fact is therefore already recorded, or its assignment already ended.
6. **Producer cursor.**
   - `ProducerCursors.get(workerId, journalId)` and `save(cursor)` store `confirmedThrough` and the applied sequences above it. The PostgreSQL adapter keeps them in `producer_cursors`, keyed by `(worker_id, journal_id)`. `save` is an upsert under the transaction's SERIALIZABLE isolation.
   - The inbox runs before the cursor, so an observation identity already applied never reaches it. A new identity at an applied sequence is a `rollback`.
7. **Confirmation.** When `confirmedThrough` grows, the transaction appends `execution.observations.confirmed` to the outbox on the worker's command subject. The message carries the worker, the journal, the new `confirmedThrough`, and the worker's common protocol version.
   - The outbox row's event identity is `o` followed by the SHA-256 of the worker, the journal, and `confirmedThrough`, which is unique because the value only grows.
   - The NATS publisher sends a confirmation without a `Nats-Msg-Id` header (wire contracts section 2).
8. **First contact.** `WorkerReports.recordContact(workerId)` sets `reachable` and moves `last_contact_at` to the database time, never back (scheduling-model "Worker reachability").
9. **Acceptance.** `acceptAssignment` runs on the assignment named in the payload. The worker and the generation are checked as in decision 5.
10. **Refusal.**
    - `refuseAssignment` ends the assignment. It releases unless an execution under it can run. The attempt stays active, so placement places it again under a new ownership generation.
    - `worker-slots-exhausted` and `worker-capacity-exhausted` set the worker's `capacity_refused_since` (capacity reservation section 8). An eligible worker has none.
    - `worker-admission-pressure` records the refusal's causes as the worker's pressure, under the sequence rule of decision 13.
11. **Command rejection.** A rejection of an `execution.assignment.offer` for `protocol-not-supported` refuses its assignment with `protocol-not-supported` (wire contracts section 3). The assignment is found by `AssignmentRepository.byOfferCommand(commandId)`, from the new `assignments.offer_command_id` column.
    - The migration backfills that column from the outbox rows of offers.
    - The worker's protocol version becomes `commonProtocolVersion` of the rejection's window, or none, which makes it ineligible.
    - Any other rejection is `rejected`.
12. **Exit and not-started.**
    - `recordExit` or `recordNotStarted` records the fact. A repeat is a duplicate effect.
    - **Exit.** Every exit then ends the attempt with `endAttempt`, unless the attempt has ended already (owner decision).
    - **Not-started.** A `not-started` ends the attempt only through a cancellation, as `settled` does.
    - **Release.** For each assignment of the attempt that holds its reservation, `releaseInTransaction` releases it when nothing under it can run. When it ends an assignment, it appends `execution.assignment.end` with `attempt-ended`. The command identity is `e` followed by the SHA-256 of the observation and the assignment.
    - **Refusal mark.** A terminal fact clears the worker's `capacity_refused_since`.
    - **After the end.** When the attempt ended, the transaction either opens an automatic retry (decision 14), or treats the task as terminal and closes its delegation with `closeDelegation`. A task without a delegation reports `not-found`, which is ignored.
    - **Result.** The outcome fact is the ended attempt's outcome in the task record. `readTaskResult` reads it, and is pending while the task has an active attempt.
13. **Capacity and pressure.**
    - `worker.capacity.declared` writes the slots, CPU, memory, and controls. It sets the protocol version to `commonProtocolVersion` of its window, and clears `capacity_refused_since`.
    - `worker.admission-pressure.changed` sets `admission_pressure_since` for a non-empty cause list, keeping an earlier start, and clears it for an empty one.
    - **Sequence rule.** Each kind applies only when its sequence is above the one recorded for it (`capacity_sequence`, `pressure_sequence`). Observations may pass each other after a redelivery, so an older one never overwrites a newer one.
14. **Automatic retry.** `automaticRetryOf(task, attemptId)` in the scheduling domain answers whether the ended attempt gets an automatic retry. It holds only when all of these hold:
    - the attempt is not cancelled;
    - its outcome is `not-started`, or `exited` with a proven start and a status other than exit code 0;
    - the task has fewer than `MAX_AUTOMATIC_RETRIES` (2) attempts that retry another.

    The retry opens with `openAttempt(..., { id, retryOf })` under the derived attempt identity of 21a. Placement places it with `automaticRetryOf`, so the reservation checks the retry allowance and the released earlier reservation (capacity reservation section 13). An exit code 0 never retries: a clean exit is not acceptance, and the gates decide (invariant 11).
15. **Placement rejection.** When the last reason of a placement try rejects (its `reasonOutcome` is `rejected`), the placement transaction ends the attempt instead of rolling back. The ended attempt owns no execution, so its outcome is `not-started`. It closes the task's delegation, retries nothing, and forgets the task's backoff. A waiting or standing reason still rolls back, as in 21a.
16. **Release outcome (Q3).** `releaseInTransaction` returns `{ outcome: 'released' | 'kept', assignment }`.
    - `kept`: an ended assignment whose execution can still run, which was an error before.
    - `ResourceAdmissionService.releaseAfterTerminalFact` returns the same value.
    - Every caller and test is updated.
17. **Composition.** `prepareTopology` ensures the durable observation consumer `control-plane-observations`. The composition root runs it under the shutdown signal, with the logger and metrics of the other loops.

## Risks / Trade-offs

- **Quarantine growth.** Until 21c and 21d, every unconsumed observation reaches quarantine after five deliveries, and the worker republishes it while unconfirmed. Before item 20b no worker publishes observations, so this affects only tests.
- **One consumer instance.** The SERIALIZABLE transaction keeps two instances correct, as for the other loops of the single G2 control plane.
- **Backfilled offers.** An offer whose outbox row is gone has no `offer_command_id`, so a protocol rejection of it is `rejected`. G2 has no deployed installation.

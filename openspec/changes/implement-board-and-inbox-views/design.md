## Context

G3 item 15 ([G3 work plan](/docs/g3-plan.md), row 15), sub-change 15a under the coordinator's split (Q1 (b)), implements the six reads of [control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) section 8 that `control-plane.openapi.json` 0.4.0 already declares, over the product ports of item 8 ([product ports](/docs/contracts/product-ports.md) sections 2 to 4), and emits the `card-changed` and `board-changed` events of section 10 that item 14 typed.

**Goals.** One snapshot per view, never partial and never paged, stamped with `asOf` and the event log's head read first (section 8, "Snapshots"); the framework mapping, merge gate, session activity, placement obstacle, and task end rules of product ports sections 3.2 to 3.9; events whose data is what the read returns at the projection's commit, once per change, committed with what they report.

**Non-goals.** The inbox answers, their idempotency keys, and the reconciliation source (15b); the merge queue adapter (item 23); task intake (item 25); SPA screens (items 29 and 32); new operations or contract changes.

## Sources

- Control-plane wire contracts sections 3 (roles), 7, 8, and 10; `control-plane.openapi.json` `Board`, `BoardCard`, `TaskDetail`, `InboxView`, `InboxCounts`, and the event schemas.
- Product ports sections 2 to 4 and `packages/modules/execution/src/ports/board-read-model.ts` and `needs-you.ts`.
- The archived changes `implement-ui-event-stream` (the outbox, the numbering pass, `LogViewPositions`), `implement-project-setup` (projects, roles, the auto-merge setting), and `align-product-ports-with-g2-lifecycle`.

## Decisions

### 1. The card store (Q2 (a))

`CardCatalog` (`packages/modules/execution/src/ports/card-catalog.ts`) holds a card per root run: `runId`, `projectId`, `title` (1 to 200 code points, no control character, no unpaired surrogate, which UTF-8 text in PostgreSQL cannot keep, so both adapters accept the same titles and read them back unchanged), `workType`, and `createdAt`; `register` answers `conflict` for a known run. `tasks(runId)` lists the card's tasks through the task lineage of its root, so a re-admitted task and a delegated child task belong to the card (product ports "One card per root run"), in admission order, each delegated child under its parent (decision 10); a lineage conformance case runs against both adapters. A run without a row is not a card, which keeps delegated child runs off the board. Item 25's intake writes the rows; until it lands no writer registers one, so every board is empty and every task detail answers `404`. Tests seed rows through the port.

### 2. The stage rules

`application/board-stages.ts` of `@taskelith/execution` orders a run's stages topologically, ties in the port's order, and derives each stage's column from its obligations (section 3.2, rules 1 to 5). The current stage is the first not completed, or the Close stage (the last with `closure`) once all are; a card is in `review` while its Close stage is current and `archived` once merged (rule 6). A card is merge-ready when every stage but the Close stage and its dependents is completed with every gate passed (section 3.4).

### 3. The merge gate (Q5 (a))

`NoMergeQueue` (`packages/modules/integrations/src/adapters/no-merge-queue.ts`) answers `not-found` for every run's latest request, an empty queue to `claimNext`, `unavailable` to `enqueue` and `recordManualMerge`, since no queue is built, and `not-found` to `transition`, since it holds no request to transition. `integration` therefore follows section 3.4, rules 1 to 4, from readiness and the auto-merge setting alone: `not-ready`, `ready` with auto-merge on, `awaiting-manual-merge` with it off; a request in flight wins once item 23 records one.

### 4. Tasks, sessions, and obstacles

`application/card-tasks.ts` derives each task's session activity (section 3.6, the most urgent first; `working` only while a session binds the task's active attempt or still runs a generation of it, so a session that stopped in an earlier attempt leaves a retry awaiting placement `stopped`; a session whose owning worker is unreachable is `worker-unreachable` with its last contact, or `stopped` when no contact was ever recorded, since the schema requires the time), its placement obstacle (section 3.8: the rejection of an ended task; else, for a task waiting for placement, the fleet's obstacle; else the most recent observation, the scheduler's on a tie; none while a reservation is held), and its end (section 3.9). A card's `waitingFor` is the first that holds: a person (an open item, or a manual merge or escalation), the merge queue, capacity (a task of the current stage with a waiting obstacle), then, for an idle stage that has not completed, a reviewer when it has the `review` obligation and otherwise a stage admission. The contract names the values but not this order; the design fixes it. The card's `obstacle` is the first rejected one of the current stage's tasks in task identifier order, else the first waiting one only while `waitingFor` is capacity (section 3.3); each task in the detail keeps its own.

### 5. One snapshot per view (Q6 (a))

`BoardStore.snapshot` runs each view in one `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` transaction (`database.readOnly`). The view reads the log's head first, then the time, then every store, so every entry at or below `position` is in the view, and a change committed after the snapshot began stays out. A store that fails answers `503`; a run missing for a registered card answers `500`.

### 6. The inbox

`BoardViews` implements `NeedsYouInbox` over the registered `NeedsYouSource`s of the snapshot; on dev that is the native request source of 13b, built per snapshot with the snapshot's head as its position (`AgentSessionServices.sourceIn`). `open` pages every source to its end, filters by `kind` and `runId`, and sorts newest first, then by item identifier; a source that fails answers `503`. `counts` answers `total`, every open item of the scope, and `byCard`, the open items of each registered card of a project scope in run identifier order; an installation scope has no `byCard` entries. `needsYou` of a card counts its open items.

### 7. Card touches and the projector (Q4 (b))

Triggers of migration `1792934100000` write a `card_touches` row in the transaction of every write a card or its task detail reads: the card row, runs, gates, task lineage, tasks, admissions, assignments, placement outcomes, agent sessions, inbox items, the auto-merge setting, and workers, on insert, update, and delete (a card only on insert); a worker update that changes none of the fields the board reads (its placement record and whether it is enrolled) writes none, so a contact time, a self-check sequence, a journal, or a rotated credential alone touches no card. The fleet obstacle of every waiting card reads the fleet's free slots and the installation's quarantine and recovery epoch, so a reservation held or released, a reservation moved to another worker, and a change of the quarantine or the recovery epoch write a `fleet` touch, which names every card, as a worker touch does. Triggers keep the board projection out of every module and commit or roll back with the write (decision 9). `CardProjector.project` runs in each numbering pass before it numbers (decision 11 bounds its transactions): per batch of 100 touches, in one `SERIALIZABLE` transaction, it deletes the touches, resolves their cards, and appends `card-changed` when a card's projection, the card and its task detail (wire contracts section 8, "Cards"), differs from the stored one (a fleet obstacle's `observedAt` aside, which is each read's time), with the card as its data, and, after a worker touch, `board-changed` for each project whose stored `workersOnline` differs. A failed projection is logged as `events.projection.failed` and the numbering still runs. The crash point `CardProjectionCommit` sits before and after that commit: a crash leaves the touch or its event, never neither, and the restart appends the event once.

Dedupe bound. Frequent writes, such as the `agent_sessions` updates of a session's output, each write a touch, but they do not each make a projection: `take` reduces a batch of up to 100 touches to the distinct cards they name, so the projector reads each touched card once per batch, and it appends `card-changed` only when that read differs from the stored projection. The reads are therefore bounded by the touched cards per numbering pass, not by the writes; the events by the real changes. A worker or fleet touch still reads every card of the installation, which a follow-up narrows.

First touch. No `workersOnline` is stored before the projector's first worker touch, so the first worker touch after the migration appends one `board-changed` per project, and the first touch of each card one `card-changed`. These are known one-time events of the deployment; the migration does not seed the stored values to avoid them.

### 8. HTTP

`BoardApi` serves the six operations after the project check (`404` for an unknown project), with the role requirements already in `access-requirements.ts`. `callerMayAct` is the caller's `project-operator` requirement on the project, evaluated in the handler; no port decides authorization. `readTaskDetail` answers `404` for a run that is no card of the project. `traceability` is empty (decision 9).

### 9. Deviations

Two deviations from the brief and the contracts, each with its follow-up:

- **Traceability.** `TaskDetail.traceability` is `[]`: no store holds requirement references and the links from them to work items and attempts. Item 25's intake owns the requirement links (coordinator, 2026-11-03).
- **Trigger-written touches.** The brief's Q4 (b) has each writer append its touch. Database triggers write it instead, in the same transaction as the writer's own statement, so the touch commits or rolls back with the write exactly as a writer's append would, and no module learns about the board. Every row write to a watched table fires its trigger, whichever module makes it; only a `TRUNCATE`, which no writer uses, bypasses them.

### 10. Admission order (pass 1 finding 6)

Reading. Product ports section 3.7 lists "every task of the run and every delegated child task of its lineage (`tasks`), in admission order", and `TaskDetail.tasks` in `packages/contracts/documents/control-plane.openapi.json` says "Every task of the run and every delegated child task of its lineage, in admission order". In both, "its admission" is a value each task holds, and a task is opened from its admission (`openTask`, `packages/modules/execution/src/domain/task.ts`); a re-admission (`rebindAdmission`) binds the same task to another admission. Admission order is therefore the order in which tasks were created, so the sequence attaches to the tasks INSERT, not to an admissions writer, which would move a re-admitted task.

Sequence. Migration `1792934100000` adds `tasks.admission_seq bigint NOT NULL DEFAULT nextval('tasks_admission_seq')`, so the INSERT of `PostgresTaskRepository.add` takes the next value in its own transaction, with no counter row and no lock. The migration numbers the existing tasks in task identifier order (`COLLATE "C"`), moves the sequence past them, and then makes the column `NOT NULL`, so the read has no special case; the down migration drops the column and the sequence. The order is total and stable, not commit order: concurrent admissions may commit in another order than their values, and a rolled-back or conflicting INSERT leaves a gap.

Read. `PostgresCardCatalog.tasks` orders the lineage by the path of admission sequences from the root task, so each delegated child follows its parent and its parent's earlier children, as section 3.7's "shown under its parent" requires. `InMemoryCardCatalog.admit` numbers each task in call order and `tasks` orders by the same path (coordinator, 2026-11-03, after pass 2), so the in-memory board world, which admits through it, matches PostgreSQL; an integration test admits a child after a later root task and compares both.

### 11. Bounded and isolated projection (pass 2 findings 1 and 2)

A worker or fleet touch still reprojects every card of the installation until G6 (coordinator decision (a) after pass 1), but no longer in one transaction, and one unreadable card no longer holds the others.

Bounding (finding 2). A pass first runs one `SERIALIZABLE` expansion transaction: it deletes every project, worker, and fleet touch, inserts one `run` touch per card each names, appends `board-changed` after a worker touch, and reads the last touch identifier as the pass's horizon. Then each batch transaction takes at most 100 card-sized touches up to the horizon, projects their cards, and deletes the touches with the events in the same commit. A crash between transactions loses nothing, since each transaction consumes only what it commits, and repeats nothing, since a repeated card compares equal to its stored projection; the crash test covers a fleet touch over 101 cards across the batch boundary. A batch reads about 100 cards, so a serialization failure retries a small transaction, with the database's bounded retry; when the retries run out the batch answers `unavailable` and its touches stay for the next pass. Batching was chosen over retry with backoff because it bounds the work and the conflict window without a new retry policy.

Isolation (finding 1). A card whose record or view read answers a failure is unreadable: the batch appends nothing for it and inserts a new `run` touch, above the horizon, so the touch stays pending and the next pass retries the card; a failure of the projection state, the outbox, or the touches fails the batch as before. `project` answers the touches consumed and the unreadable cards, and the numbering pass logs `events.projection.skipped` with their run identifiers and count only. The horizon keeps such a card to one try per pass, so a pass always ends.

## Coordinator decisions

Niki, 2026-11-03, on the brief's questions:

- Q1: (b) split; this change is 15a, the six reads and the two emitters; 15b `answer-inbox-items` follows with migration `1792934200000`.
- Q2: (a) a card store behind `CardCatalog` that item 25 writes; a run without a row is not a card; the empty board until item 25 is documented (decision 1).
- Q3: (a) the reconciliation source belongs to 15b.
- Q4: (b) a transactional touch and one projector with a crash-point test (decision 7).
- Q5: (a) a named empty `MergeQueue` adapter (decision 3).
- Q6: (a) one read-only `REPEATABLE READ` transaction per view, the head read first in it (decision 5).

Niki, 2026-11-03, after review pass 1:

- (a) Follow-up: narrow the worker touches to that worker's cards, and measure on a large board; the design states the dedupe bound (decision 7).
- (b) The first touch after the migration appends one `board-changed` per project, a known one-time event that the migration does not seed (decision 7).
- (c) Traceability goes to item 25, whose intake owns the requirement links, and admission-order task ordering to 15b or the first store that holds admission order; the spec delta states that `traceability` is `[]` and the order is by task identifier until then (decision 9). The decision on finding 6 below replaced the order part.
- (d) The three deviations are recorded as decisions, the trigger-written touches justified by the writer's transaction (decision 9).

Niki, 2026-11-03, on pass 1 finding 6: fix it in this change with a PostgreSQL sequence on the writer that admission names, backfilled in task identifier order, with each delegated child under its parent (decision 10).

Niki, 2026-11-03, after review pass 2:

- Keep the installation-wide reprojection of a worker or fleet touch until G6; isolate a failing card, keeping its touch pending and logging identifiers and a count only, and bound the transaction, preferring batches whose touches and events commit together (decision 11).
- The in-memory board world orders a card's tasks by the same root-to-task admission path as PostgreSQL, and the parity test admits a child after a later root task (decision 10).

## Review checklist

`checklist.json`, saved with the brief's invocation at `468783d9`, size L. Review categories, most frequent first: contract-drift, spec-wording, error-handling, missing-fail-before-test, docs, naming, concurrency-race. Record quality: evidence-mismatch, spec-wording, docs, stale-citation, contract-drift, process, missing-fail-before-test.

## Test plan

- Execution: the card store conformance cases and record parsing; the stage rules (order, columns, the Close stage, readiness, gate urgency).
- Integrations: `NoMergeQueue` answers.
- PostgreSQL: the conformance cases, the check constraints, the touches of each trigger, including the admission touch and the fleet touches of a reservation and of the installation, and none after a rollback, for a contact-only worker update, or for an occupancy-neutral reservation update, the projection state, the admission order of a card's tasks with delegated children under their parents, and the migration's up and down steps, including the backfill of the admission sequence.
- Control plane: the views over an in-memory world (snapshot order, columns, sessions, obstacles, ends, the merge gate, the task detail, the inbox, a failing source); the projector's dedupe and its event after a change of the task detail alone; the routes and their roles; the numbering pass's projection; over PostgreSQL, the snapshot, a card committed after the head, the numbering of a projected event only after every older transaction ended, waiting on that condition, the projector's events, the crash points, a failing store, and the same task order as in memory.
- After pass 2: an unreadable card beside a readable one, its retry and repair; a fleet touch over 101 cards crashing at either side of the first batch's commit; the expansion and the horizon of `take`; worker updates of unread columns and deletes; the index collation and the sequence owner; the lineage conformance case on both adapters; an unreachable worker without a contact.
- Fail-before: the tests against the base sources, and targeted mutations, each turning at least one test red.

## Risks / Trade-offs

- A worker or fleet touch reprojects every card of the installation, and session output updates touch their task often; the batch dedupes the reads per card and the stored projection the events (decision 7), and decision 11 bounds each transaction to a batch, but the reads of a pass still grow with the cards.
- An unreadable card is retried once per pass until it can be read, and logged each time (decision 11).
- The admission order of concurrent admissions is the order of their sequence values, not of their commits (decision 10).
- The first worker touch after the migration emits one `board-changed` per project (decision 7).
- `traceability` stays empty until item 25 (decision 9).

## Follow-ups

- Narrow the worker touches to that worker's cards, and measure the projection on a large board (coordinator, 2026-11-03).
- Requirement traceability in the task detail: item 25, whose intake owns the requirement links.
- A reference from `cards.project_id` to `projects` once item 25's intake guarantees that the project row comes first; a later migration cannot add one to an earlier table, because each down migration must run over every later table (pass 2 finding 7).

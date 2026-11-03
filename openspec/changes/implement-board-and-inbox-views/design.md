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

`CardCatalog` (`packages/modules/execution/src/ports/card-catalog.ts`) holds a card per root run: `runId`, `projectId`, `title` (1 to 200 code points, no control character), `workType`, and `createdAt`; `register` answers `conflict` for a known run. `tasks(runId)` in the PostgreSQL adapter lists the card's tasks through the task lineage of its root, so a re-admitted task and a delegated child task belong to the card (product ports "One card per root run"). A run without a row is not a card, which keeps delegated child runs off the board. Item 25's intake writes the rows; until it lands no writer registers one, so every board is empty and every task detail answers `404`. Tests seed rows through the port.

### 2. The stage rules

`application/board-stages.ts` of `@taskelith/execution` orders a run's stages topologically, ties in the port's order, and derives each stage's column from its obligations (section 3.2, rules 1 to 5). The current stage is the first not completed, or the Close stage (the last with `closure`) once all are; a card is in `review` while its Close stage is current and `archived` once merged (rule 6). A card is merge-ready when every stage but the Close stage and its dependents is completed with every gate passed (section 3.4).

### 3. The merge gate (Q5 (a))

`NoMergeQueue` (`packages/modules/integrations/src/adapters/no-merge-queue.ts`) answers no request for every run, an empty queue, and `unavailable` for a write. `integration` therefore follows section 3.4, rules 1 to 4, from readiness and the auto-merge setting alone: `not-ready`, `ready` with auto-merge on, `awaiting-manual-merge` with it off; a request in flight wins once item 23 records one.

### 4. Tasks, sessions, and obstacles

`application/card-tasks.ts` derives each task's session activity (section 3.6, the most urgent first), its placement obstacle (section 3.8: the rejection of an ended task; else, for a task waiting for placement, the fleet's obstacle; else the most recent observation, the scheduler's on a tie; none while a reservation is held), and its end (section 3.9). A card's `waitingFor` is the first that holds: a person (an open item, or a manual merge or escalation), the merge queue, capacity (a waiting obstacle), then, for an idle stage that has not completed, a reviewer when it has the `review` obligation and otherwise a stage admission. The contract names the values but not this order; the design fixes it.

### 5. One snapshot per view (Q6 (a))

`BoardStore.snapshot` runs each view in one `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` transaction (`database.readOnly`). The view reads the log's head first, then the time, then every store, so every entry at or below `position` is in the view, and a change committed after the snapshot began stays out. A store that fails answers `503`; a run missing for a registered card answers `500`.

### 6. The inbox

`BoardViews` implements `NeedsYouInbox` over the registered `NeedsYouSource`s of the snapshot; on dev that is the native request source of 13b, built per snapshot with the snapshot's head as its position (`AgentSessionServices.sourceIn`). `open` pages every source to its end, filters by `kind` and `runId`, and sorts newest first, then by item identifier; a source that fails answers `503`. `counts` counts by kind and, for registered cards only, by card. `needsYou` of a card counts its open items.

### 7. Card touches and the projector (Q4 (b))

Triggers of migration `1792934100000` write a `card_touches` row in the transaction of every write a card reads: the card row, runs, gates, task lineage, tasks, assignments, placement outcomes, agent sessions, inbox items, the auto-merge setting, and workers; a worker update that changes only `last_contact_at` writes none. Triggers keep the board projection out of every module and commit or roll back with the write. `CardProjector.project` runs in each numbering pass before it numbers: in one `SERIALIZABLE` transaction per batch of 100 touches it deletes the touches, resolves their cards, and appends `card-changed` when a card's projection differs from the stored one (a fleet obstacle's `observedAt` aside, which is each read's time), and, after a worker touch, `board-changed` for each project whose stored `workersOnline` differs. A failed projection is logged as `events.projection.failed` and the numbering still runs. The crash point `CardProjectionCommit` sits before and after that commit: a crash leaves the touch or its event, never neither, and the restart appends the event once.

### 8. HTTP

`BoardApi` serves the six operations after the project check (`404` for an unknown project), with the role requirements already in `access-requirements.ts`. `callerMayAct` is the caller's `project-operator` requirement on the project, evaluated in the handler; no port decides authorization. `readTaskDetail` answers `404` for a run that is no card of the project. `traceability` is empty, since no store holds requirement references yet.

## Coordinator decisions

Niki, 2026-11-03, on the brief's questions:

- Q1: (b) split; this change is 15a, the six reads and the two emitters; 15b `answer-inbox-items` follows with migration `1792934200000`.
- Q2: (a) a card store behind `CardCatalog` that item 25 writes; a run without a row is not a card; the empty board until item 25 is documented (decision 1).
- Q3: (a) the reconciliation source belongs to 15b.
- Q4: (b) a transactional touch and one projector with a crash-point test (decision 7).
- Q5: (a) a named empty `MergeQueue` adapter (decision 3).
- Q6: (a) one read-only `REPEATABLE READ` transaction per view, the head read first in it (decision 5).

## Review checklist

`checklist.json`, saved with the brief's invocation at `468783d9`, size L. Review categories, most frequent first: contract-drift, spec-wording, error-handling, missing-fail-before-test, docs, naming, concurrency-race. Record quality: evidence-mismatch, spec-wording, docs, stale-citation, contract-drift, process, missing-fail-before-test.

## Test plan

- Execution: the card store conformance cases and record parsing; the stage rules (order, columns, the Close stage, readiness, gate urgency).
- Integrations: `NoMergeQueue` answers.
- PostgreSQL: the conformance cases, the check constraints, the touches of each trigger and none after a rollback or for a contact-only worker update, the projection state, and the migration's up and down steps.
- Control plane: the views over an in-memory world (snapshot order, columns, sessions, obstacles, ends, the merge gate, the task detail, the inbox, a failing source); the projector's dedupe; the routes and their roles; the numbering pass's projection; over PostgreSQL, the snapshot, a card committed after the head, the projector's events, the crash points, and a failing store.
- Fail-before: the tests against the base sources, and targeted mutations, each turning at least one test red.

## Risks / Trade-offs

- A worker touch reprojects every card of the installation, and session output updates touch their task often; the stored projection dedupes the events, but the reads grow with the cards. Narrowing the worker touch is a follow-up if the board grows large.
- Task order in a card is by task identifier, since no store keeps the admission order.
- The first worker touch after the migration emits one `board-changed` per project, since no `workersOnline` is stored yet.
- `traceability` stays empty until a store holds requirement references.

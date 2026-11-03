## Context

Sub-change 15a `implement-board-and-inbox-views` (#431, `1c75f149`) serves the board and inbox reads: `NeedsYouInbox` aggregates the registered `NeedsYouSource`s, of which only the native request source of items 13 and 18 existed, and card touches written by triggers in the writer's transaction feed the `CardProjector`. This sub-change, 15b `answer-inbox-items`, serves the two answer operations, their idempotency keys, and the reconciliation source over the G2 `ReconciliationQueue` (coordinator Q3 (a), 2026-11-03).

Until item 25 no writer registers a card, so in a running installation the reconciliation source lists unknown executions only for cards the tests register; unrecorded processes, which name no card, are listed from the start.

## Sources

- [Product ports](/docs/contracts/product-ports.md) section 4: 4.1 the items and the reconciliation reasons, 4.2 the answers, 4.3 the ports; section 2, rule 7, idempotency.
- [Control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) section 7 (idempotency before redaction, the atomic key check) and section 8 (the answer statuses and the role checks before the body).
- ADR 0008 decision 4; [ADR 0015](/docs/decisions/0015-g2-closure.md) decision 5, which leaves the reconciliation surface to G3.
- The 15a design, decisions 6, 7, 9, 10, and 11.

## Decisions

### 1. The source's item read and the answer's scope

`NeedsYouSource` gains `item(scope, itemId)`, which reads an item of the scope in any state, or none. The answer service locates an item by asking each registered source in turn, and the HTTP handler reads it before the body to check its `answerableBy` role. `AnswerRequest` gains the `scope` of the inbox that is answered, and a source answers `not-found` for an item outside it, so a project's path never answers another project's item or an installation item. Both are port changes inside Execution; no OpenAPI operation or schema changes.

### 2. Idempotency keys (product ports section 4.2)

`InboxAnswers` runs each answer in one `SERIALIZABLE` transaction of `PostgresDatabase`: it first locates the item in the answer's scope, so an item outside it is `not-found` before any key is read, then reads the key, and for a held key with the same digest it returns the stored first outcome, and with another digest it answers `conflict` `idempotency-key-reused`, before any source; for a new key it locates the item, calls its source, and records the key with its digest and outcome. A key is scoped to its item (primary key `item_id`, `idempotency_key`). A refused answer records no key, so the same key may answer again once the refusal no longer holds.

The digest is the control plane's keyed `InputDigest` (`HmacInputDigest`, HMAC-SHA-256 under the key the session timeline uses) of the unredacted answer and its responder, serialized in a fixed field order per answer kind (`answerInput`). Naming the responder makes a key that another principal repeats `idempotency-key-reused`, never the first principal's outcome.

Two concurrent answers both read no key and both reach the source; the database serializes them, the loser's transaction is rolled back and retried as a whole, and its retry finds the key (a repeat or `idempotency-key-reused`) or a resolved item (`already-answered`). The adapters insert with `ON CONFLICT DO NOTHING` and answer `conflict` for a row that is already there.

### 3. The native request source in the answer's transaction

The native request source answered through its own session timeline service, outside the answer's transaction. `sourceIn` of the agent session composition now binds both the session store and the timeline service to the transaction it is given, so a native answer, its inbox item's resolution, its event, and the answer key commit together.

### 4. The reconciliation source (Q3 (a); product ports section 4.1)

`ReconciliationSource` owns the kind `reconciliation`:

- **Unknown executions.** For a project scope it reads the project's cards, their tasks, and every execution with evidence other than `cancellation-not-applied`. Such an execution is an item: `open` while it is unknown (G2 `isUnknownExecution`), `closed` once a terminal fact ended it, at the exit's record time, else, for a `not-started` execution, which records no time, the time the card projector first recorded it closed (decision 9), else the task's change time until then. The card subject names the project, run, task, attempt, the ownership generation of the execution's grant, which the task keeps while the execution can run (G2 `claimOwnership`), so a later re-admission never changes it, and the execution, and the item carries the execution's evidence; `answerableBy` is `project-maintainer`.
- **Unrecorded processes.** For the installation scope it reads `ReconciliationQueue.unrecordedProcesses()`, new in this change, every worker's in record order, and lists each one that no answer acknowledged. Its installation subject names the worker, journal, and observation; `answerableBy` is `installation-owner`.
- **Identifiers.** An item's identifier is `r` and the first 32 hexadecimal digits of the SHA-256 of its subject's parts, so every read names the same item without storing it.
- **Paging.** Open items are listed in identifier order, at most 100 per page, after the given identifier.
- **Answers.** A closed item answers `precondition-failed` `item-closed`, a resolved one `conflict` `already-answered`, and a decision that does not match the reason `invalid` (wire contracts section 8, 400). The evidence reference and the reason are redacted with `@taskelith/secrets` before they are recorded; the redacted evidence is parsed again as an `EvidenceReference`.

### 5. Resolving in the answer's transaction

`TransactionalReconciliationResolver` applies an open item's answer in the answer's transaction:

- For an unknown execution it rereads the task and refuses with `item-closed` when the execution is no longer unknown, with `attempt-not-current` when the task's ownership generation differs from the subject's, and with `subject-changed` when G2 `resolveByOperator` refuses. Otherwise it stores the operator-resolved task, which revokes the execution's grants, releases the assignment's held reservation through Scheduling's `reconcileByOperator`, and follows the attempt's end as the task end flow of item 13 does (`followAttemptEnd`).
- It records the resolved item in `reconciliation_answers`, the audit record of who resolved it, when, and with what evidence and reason, and publishes `inbox-item-changed`.
- The task's update writes its 15a card touch, so `card-changed` follows in the projector's next pass.

A view reads the same source in its read-only snapshot with the resolver `ANSWERED_ELSEWHERE`, which refuses every answer as `internal`, since a view answers nothing.

### 6. HTTP

`answerInboxItem` and `answerInstallationInboxItem` are served with the routes' operation role (wire contracts section 3), then `InboxAnswerApi.authorizeItem`, still before the body: it reads the item in the path's scope, answers 404 for none or a malformed identifier, and authorizes the item's `answerableBy` role on its project, or the installation owner for an installation item, through `Access`. So the role and scope checks run before any key is read, and a replay by a principal who lost the item's role or scope gets a stranger's 403 or 404, never the stored outcome (coordinator constraint, Niki, 2026-11-03). The body is then parsed to the port's answer; the handler answers the resolved item as `InboxItem`. The failures map to 400, 404, 409 `CommandConflict`, and 422 `AnswerRefusal` as section 8 declares.

### 7. Migration `1792934200000`

`inbox_answer_keys` holds the key, its digest, and the first outcome per item and key. `reconciliation_answers` holds one resolved item per item identifier with its reason and resolution time; a trigger with its own function refuses every update and delete. `reconciliation_item_projections` holds each reconciliation item's last published projection and the first time it was recorded closed. `card_touches` admits the subject `unrecorded-process`, which a trigger with its own function writes for each new unrecorded process. The migration takes no function of an earlier one, so an earlier down migration can still drop its own. Its down migration drops the three tables, both functions, and their trigger, and, while `card_touches` remains, its `unrecorded-process` touches and that subject.

### 8. Deviations

- Product ports section 4.1 named `ReconciliationQueue.unknownExecutionsOfTask` and `unrecordedProcessesOfWorker`; the source derives the execution items from the cards' tasks, which also gives the closed items that the queue does not list, and lists the processes through the new `unrecordedProcesses()`. Section 4.1 is updated to this.
- Wire contracts section 8 gave an execution that is no longer unknown as an example of `subject-changed`; product ports section 4.1 closes such an item, so it answers `item-closed`. Section 8 is updated to this.

### 9. Events of the derived items (wire contracts section 10)

A reconciliation item opens and closes when a writer changes a task or records an unrecorded process, not when a source records it, so the card projector publishes those changes. For each card it projects it reads the card's reconciliation items (`DerivedInboxItems.ofCard`, the source's `cardItems`), and on an `unrecorded-process` touch, written by a trigger on `unrecorded_processes`, the installation's open items (`ofInstallation`). It compares each item with what its last `inbox-item-changed` carried, kept in `reconciliation_item_projections`, and publishes the item when it differs, in the projection's transaction; a resolved item is only recorded, because its answer published it. A failure to read a card's items leaves the card touched for the next pass.

## Coordinator decisions

- Q3 (a), 2026-11-03: the reconciliation source over the G2 `ReconciliationQueue` belongs to 15b, its HTTP and CLI surface and re-admission to item 44.
- The brief of 2026-11-03: migration `1792934200000`; no new OpenAPI operation or changed response; authorization through `Access`; an answered item touches its card through the 15a touches.

## Review checklist

`checklist.json`, saved with the brief's invocation at `1c75f149`, size M-L. Review categories, most frequent first: contract-drift, error-handling, missing-fail-before-test, naming, docs, spec-wording, concurrency-race. Record quality: evidence-mismatch, spec-wording, docs, stale-citation, contract-drift, process, missing-fail-before-test.

## Test plan

- Execution: the conformance cases of the answer keys and the reconciliation answers on the in-memory adapters; the queue's listing of every worker's unrecorded processes; the native source's item read in any state and its scope.
- PostgreSQL: the same conformance cases; the migration's key per item, the immutability of the reconciliation answers, and its up and down steps.
- Projector over PostgreSQL: an unknown execution's item is published as it opens and as its terminal fact closes it, once each; an unrecorded process's item as it opens; an answered item only by its answer; a closed item keeps its generation and closing time after a later task change.
- Control plane: the answer service's repeat, reused key, responder in the digest, refused answer without a key, scope, and store failures; the reconciliation source's listing, paging, closed items, redaction, decisions, and failures; the native source bound to the answer's transaction; the HTTP statuses, the role checks before the body, and the installation scope.
- Over PostgreSQL: an unknown execution's answer ends its attempt, releases its reservation, records the key and the answer, touches the card, publishes the event, and leaves the inbox and its counts; a refused answer changes nothing; two concurrent identical answers commit one answer that both return; two concurrent different answers commit one, the other refused as `idempotency-key-reused` or `already-answered`. The race tests hold both transactions at the key read with a barrier, a condition, never a sleep.
- Fail-before: the tests against the base sources, and targeted mutations, each turning at least one test red.

## Risks / Trade-offs

- The project scope reads every card's tasks to find its executions; the 15a reads already do so for the board, and a large board pays it once per view and per answer.
- One task record that cannot be read fails the reconciliation source, and with it the view (503), never a partial inbox (product ports section 2, rule 2).
- A resolved execution sends the worker no command of its own; `resolveByOperator` revokes its grants, as G2 defines.

## Follow-ups

- The reconciliation queue's own surface and re-admission after a resolved execution: item 44.
- The `spec-approval` and `escalation` sources: items 22, 23, and 24.
- The inbox screen: item 32.

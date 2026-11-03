## Why

G3 item 15 ([G3 work plan](/docs/g3-plan.md), row 15) gives the SPA the "Needs you" inbox of [control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) section 8. Sub-change 15a served its reads; this sub-change, 15b under the coordinator's split (Q1 (b), 2026-11-03), serves its answers, so that item 32's inbox screen can resolve what waits on a person.

## What Changes

- The control plane serves `answerInboxItem` and `answerInstallationInboxItem`, the existing operations of the OpenAPI document, as declared: the operation's role, then the item's `answerableBy` role, before the body; 200, 400, 404, 409 `CommandConflict`, and 422 `AnswerRefusal`.
- Answer idempotency keys with a keyed digest of the unredacted answer and its responder (product ports section 4.2, wire contracts section 7): the key check, the source's answer, and the key's record commit in one `SERIALIZABLE` transaction.
- A reconciliation source over the G2 `ReconciliationQueue` (coordinator Q3 (a)): an unknown execution of a card's task, answered `resolve-execution` by a `project-maintainer`, ends its attempt as operator-resolved and releases its reservation; an unrecorded process, answered `acknowledge-process` by the `installation-owner`, is recorded as acknowledged.
- `NeedsYouSource` gains `item(scope, itemId)`, an item in any state, and `AnswerRequest` its `scope`; `ReconciliationQueue` gains `unrecordedProcesses()`; Execution gains the `InboxAnswerKeys` and `ReconciliationAnswers` ports with conformance cases and in-memory adapters.
- `@taskelith/postgres` gains migration `1792934200000_inbox-answers.sql`: `inbox_answer_keys` and the immutable `reconciliation_answers`, and their adapters.
- An answered item publishes `inbox-item-changed` and touches its card through the 15a touches of its task in the answer's transaction, so `card-changed` follows.

Excluded: SPA screens (item 32); the `spec-approval` and `escalation` sources (items 22, 23, and 24); the reconciliation queue's own HTTP or CLI surface and re-admission (item 44); new OpenAPI operations or changed responses.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `control-plane-api`: the two answer operations, their keys, and the reconciliation answers.
- `product-ports`: the source's item read and answer scope, the answer stores, and the queue's unrecorded processes.
- `postgres-state`: the answer key and reconciliation answer tables.

## Impact

`packages/modules/execution`, `packages/adapters/postgres` (one migration), and `apps/control-plane` (routes, handler, the answer service, the reconciliation source and resolver, composition). No OpenAPI operation or schema changes. [Product ports](/docs/contracts/product-ports.md) sections 4.1 and 4.3 and [control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) section 8 are brought to what is built.

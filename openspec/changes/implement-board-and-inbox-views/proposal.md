## Why

G3 item 15 ([G3 work plan](/docs/g3-plan.md), row 15) gives the SPA its centrally aggregated views: the board, the task detail, and the "Needs you" inbox of [control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) section 8, behind the product ports of item 8, and the `card-changed` and `board-changed` events of section 10 that item 14 typed but did not emit. Item 29 (board and task detail) and item 32 (the inbox) wait for these reads.

Under the coordinator's split (Q1 (b), 2026-11-03), this is sub-change 15a; 15b `answer-inbox-items` adds both answers, their idempotency keys, and the reconciliation source.

## What Changes

- `@taskelith/execution` gains the card store port `CardCatalog` (a run's card: project, title, work type, creation time) with conformance cases and an in-memory adapter, and the board's stage rules (`application/board-stages.ts`): stage order, columns, the current and Close stage, merge readiness, and the most urgent gate (product ports sections 3.2 to 3.4).
- `@taskelith/integrations` gains `NoMergeQueue`, a named empty `MergeQueue` adapter that never reports a merge, until item 23 (Q5 (a)).
- `@taskelith/postgres` gains migration `1792934100000_board-cards.sql`: `cards`, `board_projections`, `card_touches`, and triggers that write a touch in the transaction of every write a card reads (Q4 (b)); `PostgresCardCatalog`, `PostgresCardProjections`, and the crash point `CardProjectionCommit`.
- The control plane serves `readBoard`, `readTaskDetail`, `readInbox`, `readInboxCounts`, `readInstallationInbox`, and `readInstallationInboxCounts`: each view is one read-only `REPEATABLE READ` snapshot whose position, the event log's head, is read first in it (Q6 (a)); the inbox aggregates the registered `NeedsYouSource`s, on dev the native request source of 13b.
- A `CardProjector`, run by the event log's numbering pass before it numbers, consumes the touches in a `SERIALIZABLE` transaction and appends `card-changed` for each changed card and `board-changed` for each project whose workers online changed.

Excluded: the inbox answers, their keys, and the reconciliation source (15b, Q3 (a)); the merge queue adapter (item 23); task intake, which writes the cards (item 25); SPA screens (items 29 and 32). Until item 25 no writer registers a card, so every board is empty and every task detail answers not-found (Q2 (a)).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `control-plane-api`: the six board and inbox reads and the card events.
- `product-ports`: the card store, and the merge gate before the merge queue.
- `postgres-state`: the card tables, the card touches, and the projection's commit point.

## Impact

`packages/modules/execution`, `packages/modules/integrations`, `packages/adapters/postgres` (one migration), and `apps/control-plane` (routes, handlers, the read models, the projector, composition). No OpenAPI operation, schema, or contract document changes; every operation was present in `control-plane.openapi.json` 0.4.0.

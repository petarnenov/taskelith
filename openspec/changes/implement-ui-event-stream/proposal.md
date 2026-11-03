## Why

G3 item 14 (`implement-ui-event-stream`, [G3 work plan](/docs/g3-plan.md) row 14) gives the SPA its live traffic: the server-sent event streams of [control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) section 10, with a durable cursor, catch-up, explicit resynchronization, authorization by project, and bounded buffers, so that a slow consumer never blocks a command or a cancellation ([architecture section 11](/docs/architecture.md#11-spa-authentication-and-live-traffic), R14). Sub-change 9a defined `streamProjectEvents` and `streamInstallationEvents` in `packages/contracts/documents/control-plane.openapi.json`; item 13 built the agent session timeline whose changes the streams report, and item 10 the login sessions and roles that end a stream.

## What Changes

- `@taskelith/execution` gains the publishing port `UiEventOutbox` with the event records of section 10, the event log port `UiEventLog` with conformance cases and the in-memory adapter, and the session timeline's events: each change of a session appends its `agent-session-changed`, `turn-changed`, `native-request-changed`, `inbox-item-changed`, and `output-appended` events in the transaction that commits it.
- `@taskelith/access` records a change of a principal's roles and an end of its login sessions in the transaction of the change, behind a `PrincipalChanges` store of the `AccessTransaction`.
- `@taskelith/postgres` gains migration `1792933900000_ui-event-stream.sql` with `ui_events` and `ui_event_sequence`: a change's transaction inserts its entries without a position and notifies `taskelith_ui_events_appended`; one assigner numbers the committed entries afterwards, under the lock of the sequence row, in insertion order and only once every transaction that inserted before them has ended (each entry stores its transaction id), and notifies `taskelith_ui_events_numbered`; a pruning job removes the entries numbered before the retention window and raises the stored floor. A crash point `EventNumberingCommit` brackets the numbering's commit.
- The control plane serves both streams: an `EventStreamHub` pulls each stream's entries from the log after its cursor, woken by the notifications and a fallback poll, sends `resync` for a cursor below the floor or beyond the head, ends a stream with `stream-ended` on a change of its reader's roles and without a frame when its login session ends, drops a stream whose unsent bytes pass 1 MiB, and sends a keep-alive comment every 15 s. The retention window is 24 h unless `TASKELITH_EVENT_RETENTION_HOURS` sets it.
- Wire contracts section 10 states the ordering rule as a client can test it: positions never decrease for a reader, a position is assigned only once its inserting transaction and every older one have ended, and an event concurrent with a role change may precede that stream's `stream-ended` (coordinator decision, 2026-11-03).
- The agent session reads carry the head of the event log as their view position, read before the view, instead of `0`.

Excluded (coordinator decisions, 2026-11-03): the emitters of `card-changed` and `board-changed`, whose records item 15's read model builds (Q2; this change ships the event types and the port); the durable snapshot of output older than the retained window, which no operation of the document serves (the 14b of Q1); any SPA screen; any new operation or schema change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `control-plane-api`: the two event streams, their cursor and resync, their ends, the retention setting, and the view position from the event log.
- `session-turn-model`: the session timeline's events in the transaction of each change.
- `trust-and-operational-foundation`: the principal changes that Access records.
- `postgres-state`: the event log tables, the assigner, and pruning.
- `control-plane-wire-contracts`: the ordering rule of event positions, reworded for the numbering horizon.

## Impact

`packages/modules/execution`, `packages/modules/access`, `packages/adapters/postgres` (one migration), `apps/control-plane` (routes, handlers, the hub, the assigner and pruning loops, composition, settings), `docs/operational-targets.md` (two provisional rows), and section 10 of `docs/contracts/control-plane-wire-contracts.md` (its ordering rule). No schema change. Commit types `chore`, `test`, and `docs`: no change to the published `taskelith` package, which ships none of these workspaces.

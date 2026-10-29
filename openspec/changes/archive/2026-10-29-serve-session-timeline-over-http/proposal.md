## Why

G3 item 13 ([G3 plan](/docs/g3-plan.md) row 13) was split by the coordinator into 13a, 13b, and 13c (archived 13a `implement-session-timeline`, `design.md`, answer Q1). 13a made the session timeline durable but left it unreachable: no HTTP operation serves it, the wire `TurnState` lacks `refused` (answer Q8), turn IDs are minted as UUIDs instead of the section 6 form, no inbox source derives items from native requests, the session input digest key is never created, and the control-plane composition does not build the service. Sub-change 13b closes these gaps for the HTTP side; 13c owns the worker messages, and 13d `redact-session-output-across-chunks` the output (coordinator answer Q1 of this change).

## What Changes

- HTTP: the operations of [control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) section 9 over the 13a service except `readAgentSessionOutput` (`listAgentSessions`, `readAgentSession`, `listAgentSessionTurns`, `listAgentSessionRequests`, `submitTurn`, `respondToNativeRequest`), each behind the project role check of section 3 that item 10 established, with a session or card outside the path's project answered as unknown, the wire reasons of the refusals, a view position of `0` until item 14, and turn IDs of `t` and 32 hexadecimal digits.
- Wire: `refused` in `TurnState` and the `Turn` variants of `control-plane.openapi.json`, the contract document updated, the version raised to 0.4.0, and the breaking change the check reports declared in `breaking-changes.json`.
- Inbox: the native request source, a `NeedsYouSource` that opens permission and input items for recorded requests and the `delivery-acknowledgement` item of section 8.1 for each uncertain delivery, resolved or closed in the timeline's own transactions, with the acknowledgement audited.
- Key and composition: `control-plane/session-input-digest.key` created at installation initialization when missing, with mode `0600`, never overwritten or logged, and the session timeline service, its scopes, and the source wired into the control-plane composition.
- Plan: G3 plan row 13 names 13a to 13d and the key creation.

Follow-up: 13d `redact-session-output-across-chunks` redacts output across chunks with a held tail and routes `readAgentSessionOutput`, which stays unrouted until then.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `control-plane-api`: the agent session operations served with their role checks, scope, and reasons; turn IDs; the key at initialization.
- `control-plane-wire-contracts`: `refused` on the wire.
- `session-turn-model`: the native request source and its items.
- `postgres-state`: the tables of the native request items and the session audit events.

## Impact

Private workspace packages `@taskelith/contracts`, `@taskelith/execution`, `@taskelith/postgres`, `@taskelith/control-plane-store`, and `@taskelith/control-plane`; commit type `chore`. The control-plane document changes (version 0.4.0). No new third-party dependency, no new wire operation, no event stream (item 14), no worker message (13c), no output change (13d), no UI.

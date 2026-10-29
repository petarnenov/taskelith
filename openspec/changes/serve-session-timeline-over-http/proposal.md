## Why

G3 item 13 ([G3 plan](/docs/g3-plan.md) row 13) was split by the coordinator into 13a, 13b, and 13c (archived 13a `implement-session-timeline`, `design.md`, answer Q1). 13a made the session timeline durable but left it unreachable: no HTTP operation serves it, the wire `TurnState` lacks `refused` (answer Q8), output is redacted per chunk only, so no output read may exist yet (answer Q5), no inbox source derives items from native requests, the session input digest key is never created, and the control-plane composition does not build the service. Sub-change 13b closes these gaps for the HTTP side; 13c owns the worker messages.

## What Changes

The design proposes a split of this brief into 13b and 13d (`design.md`, "Size and split", question Q1); this list is the full brief until the coordinator answers.

- HTTP: the operations of [control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) section 9 over the 13a service (`listAgentSessions`, `readAgentSession`, `listAgentSessionTurns`, `listAgentSessionRequests`, `readAgentSessionOutput`, `submitTurn`, `respondToNativeRequest`), each behind the project role check of section 3 that item 10 established, with a session or card outside the path's project answered as unknown.
- Wire: `refused` in `TurnState` and the `Turn` variants of `control-plane.openapi.json`, the contract document updated, the version raised, and the breaking-change check run and recorded in `breaking-changes.json` if it flags the change.
- Output: redaction of a generation's output across chunks with a durable held tail (wire contracts section 7, "Output across chunks"), and then the output read path.
- Inbox: the native request source, a `NeedsYouSource` that opens permission and input items for recorded requests and the `delivery-acknowledgement` item of section 8.1 for each uncertain delivery, resolved or closed in the timeline's own transactions.
- Key and composition: `control-plane/session-input-digest.key` created at installation bootstrap with mode `0600` through the control-plane namespace code, never logged, and `SessionTimelineService` wired into the control-plane composition.
- Plan: G3 plan row 13 names the sub-changes and the key creation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `control-plane-api`: the agent session operations served with their role checks and scope.
- `control-plane-wire-contracts`: `refused` on the wire.
- `session-turn-model`: output redacted across chunks with a held tail, the output read, and the native request source.
- `postgres-state`: the tables of the held output tail and the native request items.

## Impact

Private workspace packages `@taskelith/contracts`, `@taskelith/execution`, `@taskelith/observability`, `@taskelith/secrets`, `@taskelith/postgres`, `@taskelith/control-plane-store`, and `@taskelith/control-plane`; commit type `chore`. The control-plane document changes (version 0.4.0). No new third-party dependency, no new wire operation, no event stream (item 14), no worker message (13c), no UI.

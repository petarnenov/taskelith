## Why

G3 item 13, sub-change 13c1. The [worker messages and terminal contract](/docs/contracts/worker-messages-and-terminal.md) section 12 binds item 13 to read the session messages of protocol version 2, to raise the control plane's protocol window to 1 to 2, and to apply the session observations of its section 9 through the session timeline. Until this change the NATS adapter quarantined every session message as an unknown type, and the control plane left a session observation unconsumed.

The coordinator split 13c on 2026-11-05 into 13c1 (this change), 13c2 `write-session-commands`, and 13c3 `redact-revealed-credentials-in-session-output`, done one after another.

## What Changes

- The NATS adapter's schema tables name the two session commands `session.turn.deliver` and `session.response.deliver` and the ten session observations. The messages of G3 items 21 and 38 stay out: an observation of item 21 is still quarantined as an unknown type, while a version 2 command of items 21 and 38 passes at a version 1 worker for the worker to reject and is quarantined as an unknown type only at a version the worker supports.
- `@taskelith/contracts` exports `CONTROL_PLANE_PROTOCOL_VERSIONS`, the window of versions 1 to 2, which the control plane uses at enrollment, at a capacity declaration, and at a protocol rejection of an offer. `SUPPORTED_PROTOCOL_VERSIONS` stays the worker's window of version 1.
- The control plane applies each session observation through the session timeline service, bound to the observation's transaction, after the recovery epoch check, and only for the session's active bound attempt that the producer holds.
- A refusal of the timeline that left its stores untouched is applied without effect in the same transaction and logged as `execution.observation.evidence` with identifiers only; a repeat is applied without a log. A failure after a store call failed or wrote is returned, so the transaction rolls back.
- `docs/g3-plan.md` records the split of 13c, the promotion guard of 13c3, and the session lifecycle wiring that goes to item 18.

Not in this change: the session commands the control plane writes (13c2), the revealed credentials in the output redactor (13c3), the session lifecycle wiring and the worker's side (item 18), any HTTP or UI change, and any contract text.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `observation-consumption`: adds the session observations, their ownership check, their refusals, their epoch gate, and the control plane's protocol window.
- `execution-wire-contracts`: the `Protocol version` requirement names the export `CONTROL_PLANE_PROTOCOL_VERSIONS`.
- `nats-transport`: adds the session messages in the schema tables and the four messages left out.

## Impact

- `packages/contracts/src/protocol-version.ts`, `packages/contracts/src/index.ts`.
- `packages/adapters/nats/src/wire-message.ts`.
- `apps/control-plane/src/application/session-observation-effects.ts` (new), `watched-timeline-stores.ts` (new), `observation-effects.ts`, `observation-service.ts`, `control-plane-store.ts`, `apps/control-plane/src/composition/session-timeline.ts`, `control-plane.ts`, and `apps/control-plane/src/admin/administration.ts`.
- Tests of the three packages, and `docs/g3-plan.md` rows 13 and 18.
- No published package, HTTP contract, AsyncAPI document, migration, or dependency changes. All packages touched are private.

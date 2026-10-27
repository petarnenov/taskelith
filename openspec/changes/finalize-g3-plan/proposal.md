## Why

`docs/g3-plan.md` was a draft that "is finalized when G2 closes, because the G2 closure ADR may carry deferrals into G3; the finalized plan adds those deferrals and corrects the starting point to what G2 actually delivered". G2 closed on 2026-10-27 with [ADR 0015](/docs/decisions/0015-g2-closure.md), accepted by the owner. Its decision 5 defers several items to G3, and its "Starting point" still assumed the G2 items as planned on 2026-10-25. Placement changed again after the closure's reproduction base `bd6108d4`: #344 and #348.

## What Changes

- Status: draft becomes final, finalized on 2026-10-27 on the G2 closure, keeping the history of the owner decisions, and records that the owner started G3 on 2026-10-27; finalizing itself adds no owner decision and starts no item.
- Item 26 and the deferral table mark as open with the owner whether item 26 covers TLS for PostgreSQL.
- "Starting point": G2 as built, from ADR 0015 decisions 1 to 4 and the foundation ledger "G2 status", with the limits that matter for G3: crash windows on Linux only in the privileged test composition, the 24c scenarios on Linux only through the test-side process-group launch host, no native acceptance row fully accepted, plain localhost ports without TLS, rotated credentials not delivered, the self-check not wired into admission, no writer that invalidates launches, no re-admission or reconciliation queue surface, evidence download and retirement as G2 left them, the end of the protocol version 1 exception, the placement rotation cursor, in memory at the closure and persisted since #349, and the placement changes of #344 and #348.
- New section "G2 closure deferrals": every entry of ADR 0015 decision 5, in its order and group, with its gate and the G3 item that owns it, or "Not G3" with its gate.
- Existing items take the G3 deferrals that fit them: item 9 (evidence retirement and reconciliation queue operations), item 10 (per-project evidence download authorization and the retirement entry), item 26 (rotated credentials and TLS, source), item 27 (self-check admission wiring; "Dropped if the G2 closure delivers it" removed), item 35 (the bubblewrap user-namespace sandbox and model-calling harness scenarios on Linux), and the "Work items" introduction (every writer of gates, artifact revisions, or policy revisions calls `invalidateLaunches`).
- New items: 43 `complete-g2-native-acceptance-rows` (the macOS arm64 process ownership re-run, which the owner runs with physical access to the MacBook Air, race g, and the 24c-dependent cancellation and connectivity rows on all four entries), wave 1; 44 `implement-readmission-and-reconciliation-surface`, after items 9 and 10, wave 5.
- Item 0 `revalidate-g3-foundations` stays first and now reviews against G2 as ADR 0015 records it with the later changes of the "Starting point"; its per-item checks, decided by the owner on 2026-10-26, are unchanged.
- The dependency and wave tables list items 43 and 44.

## Capabilities

### New Capabilities

### Modified Capabilities

None. The `delivery-planning` requirement "Gate work plan" already requires the plan to list each item with its scope and dependencies, and the change is documentation only, so it sets `skip_specs: true`.

## Impact

Documentation only: `docs/g3-plan.md` and this change's records. `docs/decisions/0015-g2-closure.md` and `docs/foundation.md` are unchanged. No code, contract, specification, or dependency changes. No G3 item is started by this change.

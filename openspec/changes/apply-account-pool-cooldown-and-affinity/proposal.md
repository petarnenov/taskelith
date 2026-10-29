## Why

G3 item 12 (`implement-account-pool`, `docs/g3-plan.md`, row 12) implements the account pool contract (`docs/contracts/account-pool.md`). Its sub-change 12a (`implement-account-pool-slot-store`) stored the slots and selected a `new-session` request, and refused `resumed-session` and `after-limit` requests with `invalid` until this sub-change (its design, answer Q1). The coordinator's brief scopes 12b as the cooldown of a slot from harness plugin signals, as the agent harness port contract defines the `limit` signal and its reset time, with the pool never naming a harness; affinity on resume, which keeps the session's harness and slot or waits for that slot, never switching; and the selection after a limit, which takes a different harness or waits for the limited slot's cooldown, all inside the reservation transaction and with races proven on PostgreSQL.

## What Changes

- `@taskelith/scheduling`:
  - `selectSlotInTransaction` selects all three request kinds. A `resumed-session` request reads its own stored slot in any state and selects it with `selectResumedSessionSlot` (contract section 4.3); an `after-limit` request reads the pools of its alternative harnesses in order, never one of the limited harness, and its limited slot, and selects with `selectAfterLimitSlot` (section 4.4). A request that names another harness for its stored slot is `invalid` (section 4.1). The refusal of 12a and its two tests are replaced.
  - `least-loaded-selection.ts` exports the helpers that the three selections share: `eligibleStandings`, `reservedSlot`, `slotWait`, and `earliestCooldownEnd`.
  - `slot-cooldown.ts`: `parseDefaultCooldownMinutes` (1 to 1440 minutes) and `cooldownAfterLimit`, the cooldown rule of section 5, with a reported reset capped at `SLOT_REPORTED_RESET_MAXIMUM_MINUTES`, 10080 minutes (7 days), after the database time.
  - `applySlotLimitInTransaction`: applies a plugin's parsed `limit` event to the one slot that an assignment's reservation records, by compare-and-set, rereading after a lost one, up to `SLOT_LIMIT_APPLICATIONS` (3) applications, and then returns a retryable `conflict`; a limit for a `removed` slot is accepted as a no-op, with no write.
- `@taskelith/postgres` tests: `account-pool-selection.integration.test.ts` with four gated races on PostgreSQL.
- Documents: account pool contract status, sections 5 and 11, and a new section 12; `docs/g3-plan.md` row 12 names 12b and the follow-up 12e.

## Capabilities

### New Capabilities

### Modified Capabilities

- `account-pool-port`: removes "New-session selection in the placement transaction", whose refusal of the other kinds ends, and adds "Slot request in the placement transaction", which keeps the rest of it with its other two scenarios, "Resumed-session selection in the placement transaction", "After-limit selection in the placement transaction", and "Limit signal applied to the reserving slot". OpenSpec refuses a modified requirement that drops a scenario, so the requirement is removed and added under a new name.

## Impact

Private packages only; no new third-party dependency. No wire document changes: `control-plane.openapi.json` stays at 0.3.0. Nothing is wired into the composition: the placement service still passes no slot request, and no relay calls `applySlotLimitInTransaction` yet. Out of scope: 12c (per-run delivery), 12d (the other slot commands, the sweep, HTTP, the wire reasons, composition, the admitted pairs, key rotation), and item 18 (the relay of a session's signals from the worker).

## Follow-ups

- 12e `apply-account-pool-load-and-health-signals` (coordinator's answer Q1): usage reports, the `unhealthy` health of an authentication failure, and their section 9 tests; key rotation becomes 12f if 12d splits it off.
- 12c and 12d as the account pool contract section 11 assigns them; 12d's composition supplies the default cooldown from the control-plane installation settings (answer Q2); item 18 relays a session's `limit` event with the attempt's `AssignmentId` (answer Q3).

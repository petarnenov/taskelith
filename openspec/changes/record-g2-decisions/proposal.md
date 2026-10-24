## Why

On 2026-10-25 the owner approved every G2 decision by the author's recommendation and asked for the dependencies the author had flagged: items 14 and 15 did not depend on all four pre-G2 contracts.

## What Changes

- Mark D1–D14 in `docs/g2-plan.md` as decided by the owner on 2026-10-25, each by its recommendation: D1 (a), D2 (a), D3 (a), D4 (a) with (b) as the fallback, D5 (a), D6 (a), D7 (c), and D8 (a) through D14 (a).
- Rename the decisions section's column to "Owner decision", its "Blocks" column to "Applies to", and reword its introduction, the status line, and the dependency text, since no decision is open. G2 still starts only after G1 closes (`close-g1`); after that, by D14 (a), items run in dependency order without a per-item approval.
- Clear the "Blocked by" column of every item, and align the scope of items 1 and 2 with the decided options.
- Add items 3 and 6 to the "Depends on" of items 14 and 15, so that all execution code depends on all four pre-G2 contracts (architecture section 15). The waves and the longest chain do not move; the chain text names where the journal and supervisor join it.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

Documentation only. Every G2 decision is now made.

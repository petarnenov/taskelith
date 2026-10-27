## Why

`check-change-record-links` (#346) added `npm run verify:links` and accepted 332 archived links that break it in `scripts/record-links-baseline.tsv`. Nearly all are one `../` too shallow, because `openspec archive` moves a change directory one level deeper than the path its links were written for. The owner chose to repair them mechanically instead of keeping the baseline (decision B1, 2026-10-27).

## What Changes

- **Archived links.** A reproducible script, `rewrite-archived-links.ts` in this change directory, rewrites the destination of each of the 332 failing archived links as a root-relative link to the target it was written for, keeping its anchor. No other byte of an archived record changes; the `ext2/ext3` file-system labels of the 25b, 25c, and Linux-host records stay as historical evidence (#335).
- **Baseline removed.** `scripts/record-links-baseline.tsv` and the baseline code of `scripts/check-record-links.ts` and its tests are removed; the check now fails on any failing archived link.
- **Spec.** The `integration-flow` requirement "Record link check" gains the scenario "Archived record"; the requirement "Record link baseline" is removed.
- **Docs.** Worker step 6 of `docs/agent-task-protocol.md` drops the baseline sentence. ADR 0015, the archived-links accepted limit (line 140), and `docs/foundation.md` line 89 note decision B1 and this repair.
- **Scope addition (coordinator Niki, 2026-10-27).** ADR 0015 line 120, the decision 5 follow-up on the in-memory rotation cursor `#after`, keeps its text and gains a resolution note: `persist-placement-rotation-cursor` stores the cursor, and its citation `placement-service.ts:51`, `:85` is stale because that change removed `#after`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `integration-flow`: requirement "Record link check" modified; requirement "Record link baseline" removed.

## Impact

176 files of 83 archived changes, link destinations only; `scripts/check-record-links.ts`, `test/check-record-links.test.ts`, `scripts/record-links-baseline.tsv` (removed), `docs/agent-task-protocol.md`, `docs/decisions/0015-g2-closure.md` (lines 120 and 140 only), and `docs/foundation.md` (line 89 only). The published package does not change; commit types `docs` and `chore`.

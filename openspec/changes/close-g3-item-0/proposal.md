## Why

G3 item 0 ([G3 work plan](/docs/g3-plan.md#work-items), row 0) re-reviews the merged G3 groundwork against G2 as built before any other G3 item starts. Its change `revalidate-g3-foundations` (#357) is done when every follow-up change it lists has landed in `dev` ([its proposal](/openspec/changes/archive/2026-10-27-revalidate-g3-foundations/proposal.md)). The follow-ups have landed; the last, `align-product-ports-with-g2-lifecycle`, was integrated as #372 on 2026-10-27. The plan and the foundation ledger still describe item 0 as pending, and the plan still calls the hosted-runner Linux check open although `record-hosted-runner-linux-acceptance` (#367) resolved it. Wave 1, items 26, 27, and 43, starts once item 0 is recorded as done.

## What Changes

- **`docs/g3-plan.md`.** Item 0 is marked done on 2026-10-27, and a new section "Item 0 closure" lists its changes with their pull requests, items, and subjects, the two related test changes, and the away delegate's decisions in item 0's changes, which the owner confirmed on 2026-10-27. The dependency text names wave 1's remaining items as next. The carried row of the GitHub-hosted runner check is resolved by #367.
- **`docs/foundation.md`.** The G2 status paragraph, the deferred-item row of the G3 groundwork re-review, and the delivery-sequence paragraph record item 0 as done and wave 1 as next.

This change records facts only and edits no ADR. The owner's confirmation of the four delegate decisions comes from the coordinator's message of 2026-10-27.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. No living spec tracks the status of G3 plan items; `delivery-planning` requires the plan and its decisions, not item status. The change sets `skip_specs: true`.

## Impact

`docs/g3-plan.md`, `docs/foundation.md`, and this change directory. No code, contract, ADR, spec, test, script, or dependency changes. The commits use `docs`.

## Why

[ADR 0013](/docs/decisions/0013-intents-campaigns-and-proposal-graphs.md) and [ADR 0014](/docs/decisions/0014-decision-council-and-delegated-approval.md) recorded the intent, campaign, and blueprint model and the decision council but left their delivery gate unfixed, and their forward-compatibility obligations bind G3 without a trace to the G3 items. On 2026-10-28 the owner approved the coordinator's three recommendations on the timing of ADR 0013: trace the obligations to the G3 items, fix the gates as G9 and G10, and synchronize the documents.

## What Changes

- `docs/decisions/0016-delivery-gates-for-intents-and-council.md`: new ADR. G9 "Intents, campaigns, and blueprint dispatch" implements ADR 0013 decisions 1 to 8 with human approvals, after G4 closes, overlapping G5, and closing before the G6 pilot completes; G10 "Decision council" admits OpenCode and constitutes the council after G9; both precede G8; ADR 0003 decision 1 is amended so that OpenCode may come before Antigravity CLI; each gate needs an owner-authorized plan first.
- `docs/g3-plan.md`: a section "ADR 0013 and ADR 0014 obligations" with each obligation, its G3 items, and its status; scope notes on items 11 (the project's integration branch) and 22 (decision records from the first approval).
- `docs/architecture.md`: G9 and G10 rows in the delivery sequence, the overlap paragraph, the ADR 0013 and ADR 0014 paragraph, and the rows of section 15 and of the harness technology that state the harness order and the intent and council status.
- ADR 0013 and ADR 0014 status lines, and ADR 0003's status line and decision 1: one note each pointing to ADR 0016.
- `docs/integration-candidates.md`: the harness order sentence notes ADR 0016.

## Capabilities

### New Capabilities

### Modified Capabilities

- `delivery-planning`: adds "Intent and council delivery gates", "Authorized plans for G9 and G10", and "Forward-compatibility obligations traced".

## Impact

Documentation and specifications only; no code, package, or runtime change. No G9 or G10 work item starts: each gate's plan comes first.

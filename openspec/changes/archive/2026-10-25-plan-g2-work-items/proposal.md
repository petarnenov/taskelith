## Why

G2 starts after G1 closes. Architecture section 13 requires each gate to be decomposed through the SDLC framework into reviewed, independently verifiable work items before they are implemented, and section 15 requires four protocol contracts to be reviewed before G2 execution code. Several items depend on decisions only the owner can make.

## What Changes

- Add `docs/g2-plan.md`: the G2 starting point, twenty-seven work items with scope, purpose, dependencies, and blocking decisions, the dependency order with the items that can run in parallel, and fourteen open owner decisions with options and the author's labelled recommendations.
- Link the plan from the foundation ledger's later-phases section.

## Capabilities

### New Capabilities

### Modified Capabilities

None. The existing `delivery-planning` requirement "Gate work plan" already applies from G1 onward, so this change sets `skip_specs: true`.

## Impact

Documentation only. No product code, dependency, or decision is added, and no G2 item starts; the recommendations stay proposals until the owner decides.

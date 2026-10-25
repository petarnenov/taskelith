## Why

G3 follows G2. Architecture section 13 requires each gate to be decomposed through the SDLC framework into reviewed, independently verifiable work items before they are implemented, and several G3 items depend on decisions only the owner can make. On 2026-10-25 the owner approved drafting the G3 plan now, to be finalized when G2 closes, because the G2 closure ADR may carry deferrals into G3.

## What Changes

- Add `docs/g3-plan.md`, marked as a draft: the G3 starting point, thirty-nine work items with scope, source, dependencies, blocking decisions, and the items that go to the UI worker, the dependency order with the items that can run in parallel, and seventeen owner decisions with options and the author's labelled recommendations; the owner decided D1, the SPA stack (React, Vite, Vitest, React Router, and TanStack Query at their latest versions, following the UI proof of concept's design, with a component library that fits it), on 2026-10-25, and the plan records it; the owner then decided D17, Mantine, used without customizations to recreate the proof of concept as closely as it allows.

## Capabilities

### New Capabilities

### Modified Capabilities

None. The existing `delivery-planning` requirement "Gate work plan" already applies from G1 onward, and this change is documentation only, so it sets `skip_specs: true`.

## Impact

Documentation only. No product code or dependency is added, the only decision recorded is the owner's D1, and no G3 item starts; the draft authorizes no implementation, and the recommendations stay proposals until the owner decides.

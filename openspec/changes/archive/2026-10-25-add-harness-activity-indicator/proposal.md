## Why

On 2026-10-25 the owner asked for a small round spinner on the kanban board's cards that shows whether the card's harness is working or has stopped and is waiting, and then extended the request to every place in the UI that shows a card with a harness. Today such places show at most a static dot, so a working harness and a waiting one look alike at a glance.

## What Changes

- The `product-ui` spec gains a requirement for a harness activity indicator on every card or row that shows a harness session: board cards, the task detail, the agent session screen, the "Needs you" inbox, and the review queue. It spins while the harness works and stays still while the harness waits or has stopped.
- The UI proof of concept (a private design canvas outside the repository) already shows the indicator in those places.

## Capabilities

### New Capabilities

### Modified Capabilities
- `product-ui`: adds the harness activity indicator requirement.

## Impact

Specification only; no code. This change and the `product-ui` spec are the binding record of this owner decision, which extends the ADR 0008 decisions. The SPA is planned for G3, and the indicator needs a harness session state in the control plane's contracts, which a later change defines.

## Why

On 2026-10-25 the owner asked that every card on the kanban board carry a small round spinner that shows whether the card's harness is working or has stopped and is waiting. Today a card shows only a static dot next to its session label, so a running harness and a waiting one look alike at a glance.

## What Changes

- The `product-ui` spec gains a requirement for a card activity indicator: it spins while the harness works, and it is still while the harness waits for a person or the next admission, or has stopped.
- The UI proof of concept (a private design canvas outside the repository) already shows the indicator on every board card.

## Capabilities

### New Capabilities

### Modified Capabilities
- `product-ui`: adds the card activity indicator requirement.

## Impact

Specification only; no code. The SPA is planned for G3, and the indicator needs a harness session state in the control plane's contracts, which a later change defines.

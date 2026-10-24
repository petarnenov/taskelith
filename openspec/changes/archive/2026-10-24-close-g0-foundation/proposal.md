## Why

The owner asked to finish G0. Its exit evidence is met, and its four open work items (dependency qualification, data namespace, worker platform, first integrations) depend on later gates. The owner chose the initial worker matrix (Linux x86_64 and arm64 in the worker image; macOS on both Intel and Apple Silicon), deferred the open items to the gates that need them, and left promotion to `main` for later.

## What Changes

- Add ADR 0007 recording the worker matrix, the deferrals, and the G0 closure.
- Reproduce the G0 exit evidence from a fresh clone and record it.
- Update the foundation ledger, the worker platform contract, the architecture (sections 2, 13, and 15), README, the dependency register and inventory, the qualification records' remaining gates, and dated notes in ADRs 0001, 0002, and 0006.

## Capabilities

### New Capabilities
- `foundation-closure`: G0 closes only with reproduced exit evidence and every work item done or deferred to a named gate by owner decision.

### Modified Capabilities
- `worker-platform-foundation`: adds the initial worker matrix.
- `bootstrap-governance`: allows closing G0 when the owner defers open items to named later gates recorded in the foundation ledger.

## Impact

Documentation only. No integration is admitted and no worker platform is accepted. Promotion to `main` is not part of this change.

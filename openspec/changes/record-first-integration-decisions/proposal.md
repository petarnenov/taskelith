## Why

On 2026-10-24 the owner decided the open G0 questions: first integrations, closed-harness scope, telemetry and open-core rules, sufficiency of license evidence, the advisory exception, a hexagonal microkernel for removable integrations, light license diligence until G8, non-telemetry vendor traffic until G8, and external approvals for every harness. These decisions must be recorded so that later work cannot rely on superseded rules.

## What Changes

- Add ADR 0003 recording each owner decision and its limits.
- Update the architecture (open-source policy, harness row, plugin model, G0 row, open decisions), README, dependency register, inventory guide, and foundation ledger to match.

## Capabilities

### New Capabilities
- `integration-decisions`: Recorded owner decisions for first integrations and the plugin microkernel.

### Modified Capabilities

None.

## Impact

Documentation only; no runtime impact. No component is qualified, admitted, installed, or contacted. The closed-harness rule replaces the earlier no-closed-provider rule for harnesses and their model providers only.

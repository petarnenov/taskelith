## Why

The trust model named no role for an operator reconciliation, the audited decision that ends an attempt whose execution state is uncertain and releases its capacity (`docs/contracts/capacity-reservation.md`, `execution-model` requirement "Operator reconciliation of an execution"). The UI proof of concept gave it to `project-maintainer` and listed the question as open for G3 item 28. On 2026-10-25 the owner decided that `project-maintainer` may reconcile an attempt in an uncertain state and that the decision is audited.

## What Changes

- `docs/trust-model.md` section 3: the `project-maintainer` row gains the reconciliation of an attempt whose execution state is uncertain, with an audited decision and its evidence.
- `docs/ui-poc/README.md`: the open question is replaced by the decision.

## Capabilities

### New Capabilities

### Modified Capabilities

None. The `trust-and-operational-foundation` requirement "Explicit identity and trust boundaries" requires the project-scoped roles to be documented, and the change records a decision in that documentation without changing a requirement, so it sets `skip_specs: true`.

## Impact

Documentation only. No code, contract, or plan item changes; the control-plane authorization that enforces the role comes with G3 item 10.

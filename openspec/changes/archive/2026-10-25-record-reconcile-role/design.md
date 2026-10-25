## Context

`docs/contracts/capacity-reservation.md` lets "an operator with the authority of the trust model" reconcile an uncertain execution, and the trust model's role table did not name that authority. The proof of concept's role map (`docs/ui-poc/src/store.tsx`) already grants `reconcile` to `project-maintainer`.

## Goals / Non-Goals

Record the owner's decision where the contracts look for it. Do not change the reconciliation's semantics, the contracts, or any requirement.

## Decisions

- The decision goes into the `project-maintainer` row of the trust model, because the capacity contract defers to the trust model for the authority. `installation-owner` keeps only installation-wide capabilities, and `project-operator` does not gain it.
- The row names the decision's date, as other owner decisions in the documentation do.

## Risks / Trade-offs

None. The proof of concept already behaves this way.

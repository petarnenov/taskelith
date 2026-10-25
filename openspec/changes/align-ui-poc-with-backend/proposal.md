## Why

On 2026-10-25, at the owner's request, the Mantine UI proof of concept was reviewed against the backend already implemented on `dev` (the SDLC domain and plugins, scheduling and execution, the contracts and persistence). The review found that the proof of concept's data model disagreed with the backend in important places: a card stood for a task with one gate instead of a workflow run with stages and gates; sessions used one stored state; lost contact was shown as uncertain ownership; roles, request identity, generations, budgets, plugin versions, and worker states did not match. It also found that the `product-ui` scenario "Ownership uncertain" contradicts the supervisor identity contract, which says loss of contact is not uncertainty about the process. The owner asked for the proof of concept and the specification to be fixed, so that item 28 starts from a reference that matches the backend.

## What Changes

- Rework `docs/ui-poc/` to the backend's model, as its README section "Alignment with the implemented backend" lists: runs, stage graphs, per-stage gates with evidence kinds, admissions, the derived session status, reconciliation, roles with personas, request identity and server confirmation, a generation conflict, client-chosen IDs, worker reachability and admission pressure, concurrency quotas, plugin facts, and markers for what later gates add. Publish it as version 4 of the proof of concept artifact.
- Replace the `product-ui` requirement "Harness activity indicator" with "Session activity indicator": the same rules, with the scenario "Ownership uncertain" replaced by "Worker unreachable" and "Process state uncertain". The pinned OpenSpec refuses a MODIFIED block that drops a scenario and a requirement both removed and added under one name, so the requirement takes a new name.
- In `docs/g3-plan.md`, name the session activity indicator in the starting point, and make item 31 show an unreachable worker and an uncertain process state instead of ownership uncertainty.

## Capabilities

### New Capabilities

### Modified Capabilities

- `product-ui`: the requirement "Harness activity indicator" is removed and replaced by "Session activity indicator".

## Impact

Reference source, one specification requirement, and two phrases of the G3 plan. No product code, contract, dependency, or release is affected. This change is stacked on `record-mantine-ui-poc`, which adds `docs/ui-poc/`, and merges after it.

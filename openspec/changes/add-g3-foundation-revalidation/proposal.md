## Why

On 2026-10-26 the owner started the wave 1 contracts of G3 ahead of the G2 closure, and items 1, 2, 3, 5, 6, 7, and 8 have since merged and been archived. G2 has kept changing the ground they rest on: the supervisor, launch orchestrator, and admission pressure, the harness identifiers, the worker directory and home layout, cgroup containment, the credential model, and the item 23 installation. The same day the owner decided that this groundwork is re-reviewed against G2 as built before G3 implementation starts.

## What Changes

- Add work item 0, `revalidate-g3-foundations`, to `docs/g3-plan.md`: after the G2 closure and before any other G3 item, re-review items 1, 2, 3, 5, 6, 7, and 8 against G2 as built, each artifact by its own independent reviewer in rotation with at most three passes, with the per-item checks the owner named, and fix the findings in follow-up changes before implementation starts. It depends on the G2 closure and has no UI.
- State in the status paragraph and in the "Work items" introduction that every other item not yet merged also depends on item 0, and in the introduction that item 0's "Depends on" names the G2 closure.
- Add wave 0, holding item 0, before wave 1, update the list of items without G3 dependencies, and note that the merged wave 1 items are the subject of item 0.
- Record the owner decision with its date next to the 2026-10-26 wave 1 decision in "Dependency order and parallel work".

Numbering it 0 keeps every other item number, so no reference elsewhere changes.

## Capabilities

### New Capabilities

### Modified Capabilities

None. The `delivery-planning` requirement "Gate work plan" already requires the plan to list each item with its scope and dependencies, and the change is documentation only, so it sets `skip_specs: true`.

## Impact

Documentation only: `docs/g3-plan.md` and this change's records. No code, contract, specification, or dependency changes. Item 0 itself is not started by this change; it starts after the G2 closure.

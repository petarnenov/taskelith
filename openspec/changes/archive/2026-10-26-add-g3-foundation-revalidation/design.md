## Context

`docs/g3-plan.md` records that the owner started items 3, 5, 6, 7, and 8 on 2026-10-26 in parallel with G2, and that items 1 and 2 ran ahead of G3 on 2026-10-25. All seven are merged and archived. On 2026-10-26 the owner decided to re-review them against G2 as built after the G2 closure.

## Goals / Non-Goals

Record the owner decision as a work item and its dependencies, consistently with the plan's tables and status. Do not start item 0, do not re-review any artifact, and do not change any other item's scope.

## Decisions

- The item is numbered 0, so the existing numbers, which other documents cite, stay valid.
- The added dependency on item 0 is stated once in the status paragraph and in the "Work items" introduction, as the plan already does for the G2 closure, instead of being added to each row's "Depends on" column. Item 0's own "Depends on" cell names the G2 closure, which the introduction states as its one non-item entry. The merged items 1, 2, 3, 5, 6, 7, and 8 do not depend on item 0; they are its subject.
- The new wave is numbered 0 for the same reason. Wave 1 keeps its items: items 26 and 27 now depend on item 0, which is in an earlier wave, so the wave rule still holds. The longest chain keeps its length of twelve items: item 0, like item 3, depends on no G3 item, so a chain that starts at item 0 instead of item 3 is not longer.
- The decision is recorded in "Dependency order and parallel work", next to the 2026-10-26 wave 1 decision, and summarized in the status paragraph.
- `docs/g3-dependencies.md` is the item 1 evaluation and lists no waves or item dependencies, so it is unchanged; item 0 reviews it.

## Risks / Trade-offs

Item 0 delays every other not yet merged item until its follow-up changes are merged; that is the owner's intent. The per-artifact reviewers come from the rotation of the independent review process, so the seven reviews use several reviewers.

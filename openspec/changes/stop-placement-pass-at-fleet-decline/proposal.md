## Why

`PlacementService.#offer` (`apps/control-plane/src/application/placement-service.ts`) offers every task of the waiting read in rotation order. After the first decline for lack of fleet capacity the rotation cursor stops moving (`advance-placement-rotation-cursor`, pull requests #337 and #338), but the pass still offers the later tasks of the same read. When a slot frees during the pass, a later project's task takes it, although the declined project is next in the rotation. Review pass 3 of `advance-placement-rotation-cursor` recorded this timing risk (L2), and `placement-backoff-preserves-rotation` (pull request #344) left it out of scope as open point 2. The coordinator, Niki, assigned the candidate fix: stop the pass at its first decline for lack of fleet capacity.

## What Changes

- A placement pass makes no offer after its first decline for lack of fleet capacity (`quarantined`, `worker-not-eligible`, `worker-capacity-exhausted`, or `no-candidate`, the set `lacksFleetCapacity` names). A decline for the task's own reason, a placement, and a task that no longer waits do not end the pass; a store outage ends it as before.
- The rotation cursor rule is unchanged: it moves only by the offers before that decline, so the declined project is offered first among the projects after it in the next pass. A fleet capacity decline still keeps the task's wait unchanged.
- The capacity reservation contract sections 5 and 13 and the operational targets state the rule and that a full fleet costs one declined placement transaction per pass.
- The `execution-placement` requirement "Project rotation" states that a pass makes no offer after its first decline for lack of fleet capacity; its scenario "Capacity freed during a pass" now expects the freed slot to go to the declined project in the next pass, "Many blocked projects" names the block as the project's own limit, and the scenario "Own decline during a pass" is added.

## Capabilities

### New Capabilities

### Modified Capabilities

- `execution-placement`: a placement pass ends at its first decline for lack of fleet capacity.

## Impact

`@taskelith/control-plane`, a private workspace package. No database, API, event, or queue adapter change. A full fleet costs one declined placement transaction per pass instead of up to `PLACEMENT_BATCH` (100); a slot that frees during a pass is placed one pass later, by the rotation.

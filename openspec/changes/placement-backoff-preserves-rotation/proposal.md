## Why

A placement that no candidate accepts backs off the task by `placementBackoff`, 5 s to 60 s with jitter, and a task still backing off is not read (`PlacementService.#settle`, `apps/control-plane/src/application/placement-service.ts`; capacity reservation contract section 5). The pass runs every 5 s. A decline for lack of fleet capacity backs off too, so a freed slot goes to the read's first task whose backoff has ended, not to the next project in the rotation that `advance-placement-rotation-cursor` (pull requests #337 and #338) fixed: a project with fifty waiting tasks almost always has one due, a project with one task often does not, and under jitter the capacity is shared roughly by backlog. Review pass 2 (finding M1) of `advance-placement-rotation-cursor` recorded this as the follow-up `placement-backoff-preserves-rotation`.

The owner's delegate chose option (a) (away decision `20261027T085757Z-opencode-1447`, relayed by the coordinator, Niki): no per-task backoff after a decline for lack of fleet capacity; the backoff stays for the task's own reasons.

## What Changes

- A task declined for lack of fleet capacity (`quarantined`, `worker-not-eligible`, `worker-capacity-exhausted`, or `no-candidate`, the set `lacksFleetCapacity` names) does not back off: its wait stays as it was, so it keeps its place in the rotation and the next pass that reads it offers it. Any other decline backs off as before, and the pass backoff after a store outage is unchanged.
- The capacity reservation contract sections 5 and 13 and the operational targets state the rule, and section 5 states that the placement batch bounds the transactions a full fleet costs per pass.
- The `execution-placement` requirement "Placement backoff" excepts the decline for lack of fleet capacity and gains the scenario "Capacity decline".

## Capabilities

### New Capabilities

### Modified Capabilities

- `execution-placement`: a decline for lack of fleet capacity does not back off the task, which keeps its wait unchanged and its place in the rotation.

## Impact

`@taskelith/control-plane`, a private workspace package; `@taskelith/scheduling` keeps the one classification, `lacksFleetCapacity`. No database, API, or event change. A full fleet now costs up to `PLACEMENT_BATCH` (100) placement transactions every pass instead of fewer while tasks back off.

## Why

G1 item 7 in the [G1 work plan](../../../docs/g1-plan.md). Its exit evidence requires that unbound implementation tasks are rejected and that planning tasks can create missing specifications. Architecture section 6 ("Universal lifecycle admission") requires an admission record binding the workflow stage, the task and work item, the artifact digest, the policy revision, and the ownership generation before dispatch; requires current prerequisite gates for implementation while a missing specification starts a planning task instead of blocking it; and invalidates affected unused implementation admissions when a specification changes. Invariants 10 and 11 make every task belong to an admitted stage and make implementation admission depend on validated gates. Item 5 (`sdlc-gates`) supplies the gate and stage rules this item composes.

## What Changes

- Add task admission records to `@taskelith/sdlc` that bind the workflow and stage, the task, the work item, the exact artifact revisions the task works from, and the policy revision of the run; the ownership generation is deferred to G2.
- Implementation tasks are admitted only to a stage that covers implementation, only when bound to a work item, and only when every stage their stage depends on has passed; they are bound to exactly the revisions the passed prerequisite gates judged.
- Planning tasks are admitted to a stage that covers intake or specification without a specification or a work item, and a dispatched planning task records the artifact revisions it creates.
- Admissions are `admitted`, `used`, or `invalidated`, with a frozen transition table and compare-and-set generations; a different revision of an artifact an unused admission is bound to invalidates it, and used admissions are left to the stop and reconcile policy of G2.
- Add an application service, `TaskAdmissionService`, over two module-owned ports, `AdmissionRepository` (with a compare-and-set `replace`) and `Clock`, and an in-memory repository.

Excluded: the ownership generation, attempts, assignments, and launch authorization (G2, decision D4 (a)); the `SdlcFramework` port (item 6); wire contracts and admission events (item 13); marking gates stale when an artifact changes, which `sdlc-gates` already provides to callers; tasks of other kinds such as review or verification; persistence other than in memory.

## Capabilities

### New Capabilities
- `sdlc-task-admission`: admission records, the implementation and planning admission rules, invalidation of unused admissions, and the admission service with its ports.

### Modified Capabilities
None.

## Impact

New domain, port, application, and adapter files and two test files in `packages/modules/sdlc`. The coverage scope check (`scripts/check-coverage-scope.ts`) no longer reports a module whose compiled file declares only types, such as a port, since such a module has nothing to cover; a test covers that rule. No dependency is added, the lockfile is unchanged, and the published npm package is unchanged.

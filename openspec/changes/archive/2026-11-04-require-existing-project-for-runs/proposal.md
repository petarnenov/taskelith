## Why

G3 plan item 11 ([G3 plan](/docs/g3-plan.md) row 11), sub-change 11c, follows 11b. `createRun` accepts any `projectId`, so a run can name a project that does not exist. To keep the G2 operator flows working, sub-change 11a added the temporary G2 bridge: an `installation-owner` passes the project requirements of `createRun`, `submitTask`, `readAdmission`, and `readTaskResult` even without a role, or for an unknown project. The four routes also lack the `role-required` reason status, so a denial would answer 401 instead of the 403 that the documents declare. Since 11a projects exist and an owner can assign itself a role, so the bridge can go.

## What Changes

- `RunService` gets a `ProjectDirectory` port with `exists(projectId)`. `createRun` refuses a project that does not exist with `not-found`, which the API answers 404 after the role check. The composition adapts the port onto `ProjectSetupService.readProject`.
- The bridge is removed: `g2BridgeRequirement`, the `OwnerPass` member `g2-bridge`, its export, and the owner pass in `authorizeIn`. `createRun` and `submitTask` need `project-operator`, with no owner pass. `readAdmission` and `readTaskResult` become section 3 reads, so an `installation-owner` may read them.
- The four routes answer a `role-required` denial with 403 `AccessDenial`, and `createRun` answers 404 for an unknown project.
- Contracts: `sdlc.openapi.json` 0.5.0 declares the 404 on `createRun` and drops the bridge text from its 403 descriptions; `execution.openapi.json` 0.10.0 drops it from `readTaskResult`. The owner bearer used to succeed on `createRun` and `submitTask` for any project and is now refused, a behavior break without a schema change. `breaking-changes.json` gains an optional `behaviorChanges` list so that it can declare it.
- The installation smoke, the scenario tool, the G2 scenario installations, and the integration tests create a project, assign the owner `project-operator` over HTTP, and create runs of that project.
- Documents: control-plane wire contracts section 2 and execution wire contracts section 7.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `control-plane-api`: runs of existing projects only, and the roles and refusals of the four run operations.
- `trust-and-operational-foundation`: the temporary G2 bridge is removed.
- `sdlc-wire-contracts`: the 404 of `createRun`, the 403 descriptions, and version 0.5.0.
- `execution-wire-contracts`: the 403 description of `readTaskResult` and version 0.10.0.
- `local-installation`: the smoke creates a project and assigns the owner a role before its run.

## Impact

Private workspace packages and tooling only (`@taskelith/access`, `@taskelith/contracts`, `@taskelith/control-plane`, `scripts/`, and tests); the published `taskelith` package is unchanged, so the commit types are `chore`, `test`, and `docs`. Size M. Not in this change: a foreign key on `workflow_runs.project_id`, any change of existing project-less runs, a narrower `projectId` pattern, a link between a run and the repository binding, which item 21's per-run credential re-checks, and any UI.

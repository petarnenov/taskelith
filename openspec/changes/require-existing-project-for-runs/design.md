## Context

`createRun` (`sdlc.openapi.json`) takes its project from the body, and `RunService` registers the run in `workflow_runs.project_id`, a nullable column without a foreign key, so a run may name any project. Sub-change 11a (`implement-project-setup`) stores projects in `@taskelith/access` and added the temporary G2 bridge: the `OwnerPass` member `g2-bridge`, built by `g2BridgeRequirement` and used only by `ControlPlaneApi` for the four G2 operator operations, lets an `installation-owner` pass them without a project role, even for an unknown project. The operator bearer authenticates only the owner, so no G2 caller is ever denied. The routes of the four operations map `forbidden` to 401 and have no `role-required` reason status, so a denial would answer 401 rather than the declared 403.

## Goals / Non-Goals

Goals: runs of existing projects only, the bridge removed, the declared 403 and 404 answered, and the G2 operator flows (smoke, scenarios, integration tests) moved onto a project with a role.

Non-goals: a foreign key on `workflow_runs.project_id`, a migration of existing runs, a narrower `projectId` pattern, a run's link to the repository binding, and any UI.

## Decisions

The coordinator (Niki) decided Q1 to Q10 on 2026-11-04; each decision below names its question.

1. **Unknown project (Q1).** `createRun` answers 404 `not-found` for a project that does not exist, after the 403 role check, the order of 11a. A principal without a role on the identifier gets the identical `role-required` denial for an existing and a missing project; only a principal that holds a role on an identifier without a project, such as a G2 role row that the `NOT VALID` foreign key of `project_roles` kept, reaches the 404. 422 stays the answer for an unknown workflow, and the project check comes before the workflow check.
2. **Roles (Q2).** `createRun` and `submitTask` need `project-operator` or above, with no owner pass. `readAdmission` and `readTaskResult` become section 3 reads (`projectRead`): `project-viewer` or above, or `installation-owner`. The access rule `resource-project` gains `ownerReads`, as `path-project` has it, and `ControlPlaneApi` builds `projectRead` or `projectRequirement` from it.
3. **Unbound project (Q3).** A project without a repository binding may get a run; item 21's per-run credential issue re-checks the binding. A `control-plane-api` scenario says so.
4. **Existing runs (Q4).** Runs created before this change keep their project identifiers, which may name no project, and no foreign key is added on `workflow_runs.project_id`. Taskelith starts with fresh installations and imports no data ([architecture](/docs/architecture.md) section 1, the paragraph on new code and empty databases), so no migration is owed to installations that ran G2 builds. Such a run stays reachable only through a role on its identifier.
5. **Refusals (Q5).** The four routes get the `ROLE_DENIAL` reason statuses, so a `role-required` failure is 403 `AccessDenial` `{code: forbidden, details: {reason: role-required, requiredRole}}`; a missing or wrong bearer stays 401. Each refusal has a test: 401 unauthenticated, 403, and 404.
6. **Removal (Q6).** `g2BridgeRequirement`, `OwnerPass` `g2-bridge`, its export, and the owner pass for it in `authorizeIn` are removed. The `trust-and-operational-foundation` delta removes "Temporary G2 bridge" with its reason and migration. Every document and OpenAPI description that names the bridge is updated.
7. **Domain rule behind a port (Q7).** "A run belongs to an existing project" lives in the application service: `RunService` takes a `ProjectDirectory` port (`exists(projectId)`), defined next to its other ports in `apps/control-plane/src/application/`. The composition adapts it onto `ProjectSetupService.readProject`, the adapter that `bindableProjects` already applies for the integrations module, so both share one function. `createRun` checks the project before its run transaction; no project is ever deleted, so the check cannot go stale before the run is stored. The direct `RunService` fixtures get one shared test helper, `EVERY_PROJECT_EXISTS`. The role check stays at the API.
8. **Identifier pattern (Q8).** `projectId` keeps the `Identifier` pattern; an identifier that names no project is refused by lookup, so no request is narrowed.
9. **Contract (Q9).** `sdlc.openapi.json` goes to 0.5.0 with the 404 on `createRun` and 403 descriptions without the bridge; `execution.openapi.json` goes to 0.10.0 for the `readTaskResult` 403 description. `make contract-breaking-changes` lists no breaking change for an added response status or a new description, but the owner bearer that succeeded on `createRun` and `submitTask` for any project is now refused with 403 or 404, a behavior break without a schema change. `breaking-changes.schema.json` requires at least one listed change, so a declaration gains an optional `behaviorChanges` list: an entry names its tool-reported `breakingChanges`, its `behaviorChanges`, or both, and `make contract-compatibility` compares only the tool-reported list with the check. `breaking-changes.json` declares the break for `sdlc.openapi.json` 0.5.0, as 11b1 declared its own.
10. **Scripts (Q10).** Every operator flow creates a project with `createProject`, assigns the owner `project-operator` with `assignProjectMember`, and creates its run with the minted `p…` identifier. The owner's principal identifier comes from the output of `init`: `installation.sh` keeps `ownerPrincipalId` next to the operator secret as `TASKELITH_OWNER_PRINCIPAL_ID`, and the in-process harnesses read it from the same output.

## Risks / Trade-offs

- An operator flow now makes two more requests before its run; the smoke's deadline covers only the task result.
- A role on an identifier without a project, possible only for G2 role rows, reaches the 404; nothing else does.
- `behaviorChanges` is free text that no tool checks; review checks it, as it checks the `reason`.

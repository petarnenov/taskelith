## Why

G3 item 11 (`implement-project-setup`, [G3 work plan](/docs/g3-plan.md) row 11) gives the control plane projects: creation by an `installation-owner`, members and their roles, and the defaults that only a `project-maintainer` changes. Items 15 and 29 (board, task detail, and inbox views) wait for `listProjects` and `readProject`. Sub-change 9a defined the operations in `packages/contracts/documents/control-plane.openapi.json` and the rules in [control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) sections 3, 4, and 6; item 10 (`implement-operator-login-and-roles`) added the `Access` module, sessions, role checks, and the `project_roles` table, whose foreign key to projects it left to item 11.

The coordinator split item 11 on 2026-11-03: this change is 11a (projects, members, defaults, and the read of the auto-merge setting); 11b binds the repository.

## What Changes

- `@taskelith/access` gains projects with their defaults and their initial auto-merge setting behind a `Projects` store of the `AccessStore` port, with conformance cases and the in-memory adapter, a `ProjectSetupService`, project-scoped member commands of `PrincipalAdministration`, and a minted project identifier (`p` and 32 hexadecimal digits).
- A project role can be assigned only on an existing project, also by the administrative `assign-project-role` command.
- `@taskelith/postgres` gains migration `1792933800000_project-setup.sql` with the projects, their defaults, the auto-merge setting, and the foreign key from `project_roles` to projects, and the PostgreSQL `Projects` store.
- The control plane serves `listProjects`, `createProject`, `readProject`, `updateProject`, `listProjectMembers`, `assignProjectMember`, `removeProjectMember`, `readProjectDefaults`, `updateProjectDefaults`, and `readAutoMergeSetting`, with the roles of wire contracts section 3, compare-and-set with 409 `conflict`, and pages of at most 100 by identifier.

- The G2 documents declare the 403 `AccessDenial` on their role-checked operator operations, `sdlc.openapi.json` 0.4.0 and `execution.openapi.json` 0.9.0, without a change of behaviour (coordinator decision (c) of the pass 1 fix round).
- The living requirement "Temporary G2 bridge" names the follow-up sub-change 11c instead of item 11 as a whole as the change that removes the bridge (coordinator decision (a)).

Excluded (coordinator decisions, 2026-11-03): `readRepositoryBinding`, `bindRepository`, and the integration branch (11b); `updateAutoMergeSetting` and the push standing rule (item 23); SCM integrations and the webhook receiver (20e); `listProjectAccountSlots` (item 12); board, task, and inbox views (items 15 and 29); any SPA screen; any new operation, and any contract change other than the 403 declarations. The temporary G2 bridge stays until sub-change 11c; see [design](design.md) "Pass 1 coordinator decisions".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `control-plane-api`: the project, member, defaults, and auto-merge read operations.
- `trust-and-operational-foundation`: projects behind the `Access` port, project roles only on existing projects, and the removal of the temporary G2 bridge deferred to sub-change 11c.
- `postgres-state`: the project setup tables and the project foreign key of the roles.

## Impact

`packages/modules/access`, `packages/adapters/secrets` (one minted identifier), `packages/adapters/postgres` (one migration), `apps/control-plane` (routes, handlers, composition), and `packages/contracts` (the 403 declarations of `sdlc.openapi.json` and `execution.openapi.json`). Commit types `chore`, `test`, and `docs`: no change to the published `taskelith` package, which ships neither `@taskelith/contracts` nor its documents.

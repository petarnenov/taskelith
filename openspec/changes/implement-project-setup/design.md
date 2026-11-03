## Context

G3 item 11 ([G3 work plan](/docs/g3-plan.md), row 11) implements the project part of sub-change 9a: the operations of `packages/contracts/documents/control-plane.openapi.json` 0.4.0 under `/projects`, and the rules of [control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) section 3 (roles), section 4 (projects, auto-merge, compare-and-set), and section 6 (minted identifiers and pages). Item 10 (`implement-operator-login-and-roles`, archived 2026-10-28) built the `Access` module, the role checks of `apps/control-plane/src/api/access-requirements.ts`, which already name a rule for every operation of the document, and the `project_roles` table of migration `1792932800000_operator-access.sql`, whose comment leaves its foreign key to projects to item 11. Its design (decision 8 and coordinator answer Q3) routes `assignProjectMember` and `removeProjectMember` through `PrincipalAdministration` and leaves projects and their directory to item 11.

The coordinator split item 11 on 2026-11-03 (see "Coordinator decisions"): this change is 11a.

**Goals.** Projects created by an `installation-owner` with their defaults and an auto-merge setting that starts on; members and their roles assigned and removed by an `installation-owner`; the project name and the defaults changed only by a `project-maintainer`, by compare-and-set; `listProjects` and `readProject` for items 15 and 29; the foreign key from `project_roles` to projects.

**Non-goals.** `readRepositoryBinding`, `bindRepository`, and the integration branch that ADR 0013 asks for (11b); `updateAutoMergeSetting` with its push standing rule (item 23); SCM integrations and the webhook receiver (20e); `listProjectAccountSlots` (item 12); the board, task, and inbox views (items 15 and 29); any SPA screen (item 34); any new operation or contract change; retiring the temporary G2 bridge ("Open questions").

## Sources

- Wire: [control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) sections 2 (order and failures), 3 (role table; "a project has no member until one is assigned, and its creator gets no role by creating it"), 4 ("Projects", "Auto-merge", "Compare-and-set"), and 6 ("Minted identifiers", "Pages"); the operations and the `Project`, `ProjectCreation`, `ProjectUpdate`, `ProjectPage`, `ProjectDefaults`, `ProjectDefaultsInput`, `ProjectDefaultsUpdate`, `ProjectMember`, `ProjectMemberPage`, `MemberAssignment`, and `AutoMergeSetting` schemas of `control-plane.openapi.json`.
- Auto-merge: [product ports](/docs/contracts/product-ports.md) section 6.2 (one setting per project, on by default, with a revision and the last change); section 1 names `AutoMergeSettings` an Integrations port that the item 23 PostgreSQL adapter implements.
- Roles: [trust model](/docs/trust-model.md#3-project-scoped-authorization-roles) section 3; product ports section 2, rules 1 and 7.
- Defaults: product ports section 6.1 (spec approval policy, the values of `SPEC_APPROVERS` in `packages/modules/execution/src/domain/task-defaults.ts`); [account pool contract](/docs/contracts/account-pool.md) sections 4.1, 4.4, and 4.5.
- Plan: G3 work plan row 11 and its scope note on the integration branch ([ADR 0016](/docs/decisions/0016-delivery-gates-for-intents-and-council.md) decision 1), which belongs to the repository binding, so to 11b.

## Decisions

### 1. Module shape

Projects live in `@taskelith/access`. The `Access` module owns principal identity and project authorization ([architecture](/docs/architecture.md#modules) section 6); a project is the scope of every role, its members are the module's `project_roles`, and a member command must see the project in the same transaction as the role it writes. Item 10 named this `ProjectDirectory` (its coordinator answer Q3); it is the `Projects` store of the existing `AccessStore` port, so one transaction covers the project, the role, and the audit event.

- Domain `src/domain/project.ts`: `Project` (identifier, name, creation time, revision), `ProjectDefaults` (the SDLC framework plugin, the implementers in order of preference, the reviewer, the spec approver, and the policy for no eligible slot), `StoredDefaults` and `StoredAutoMergeSetting` with their revision and last change, and the checks of names and defaults for callers other than HTTP. The spec approver values repeat `SPEC_APPROVERS` of execution, because the module imports only the kernel and SDLC.
- Port: `AccessTransaction.projects` (`add`, `get`, `page`, `rename`, `defaults`, `replaceDefaults`, `autoMergeSetting`) and `ProjectRoles.members`, with conformance cases in `ACCESS_STORE_CONFORMANCE`, which the in-memory adapter and PostgreSQL both pass. `ProjectRoles.assign` is now `not-found` for an unknown project too.
- Application: `ProjectSetupService` (create, list, read, rename, read and replace the defaults, read the auto-merge setting, list members) and `PrincipalAdministration.assignProjectMember` and `removeProjectMember`, which share the role commands of item 10 by principal identifier.
- `RandomValues.projectId()` mints `p` and 32 lowercase hexadecimal digits from 128 random bits; `NodeSecrets` implements it as it does `principalId()`.

### 2. Authorization

The server checks the role of `ACCESS_REQUIREMENTS` before the body, as for every operation since item 10; no rule changes. A path that names a project is checked on the named identifier before the project is read, so a principal without a role gets the identical 403 `role-required` for an existing and a missing project, and only an `installation-owner` on a read, or on its own commands, learns 404 (item 10 decision 6). Each command checks the actor's role again inside its own transaction (`authorizeIn`), as `PrincipalAdministration` does, so a role removed between the two checks writes nothing; that denial is a `forbidden` with reason `role-required`, which the routes answer 403 (`reasons`), never the 401 of a refused credential.

- `createProject`, `assignProjectMember`, `removeProjectMember`: `installation-owner`.
- `updateProject`, `updateProjectDefaults`: `project-maintainer` on the project. An `installation-owner` without that role is refused, as section 3 assigns these to the maintainer alone.
- `readProject`, `listProjectMembers`, `readProjectDefaults`, `readAutoMergeSetting`: `project-viewer` or above, or `installation-owner`.
- `listProjects`: any authenticated principal; an `installation-owner` gets every project, any other principal the projects on which it holds a role (section 3), read per request.

The creator of a project gets no role by creating it (section 3): `createProject` writes no role.

### 3. Compare-and-set and the named exceptions

`updateProject` and `updateProjectDefaults` name the revision they read; the store updates the row only at that revision and increments it, so of two concurrent updates exactly one wins and the other answers 409 `conflict` (section 4; product ports section 2, rule 7). An unknown project answers 404. The project and its defaults have separate revisions, as the schemas `Project.revision` and `ProjectDefaults.revision` are separate: a rename leaves the defaults' revision and a defaults change the project's. `ProjectDefaults.changedBy` and `changedAt` are absent until the first change after creation. Member assignment names no revision and replaces the role, so the one serialized last stays; removal succeeds for a principal that is no member, also for an identifier that names no principal (section 4).

### 4. Defaults and runs

A change of the defaults applies to tasks created afterwards and changes no run (section 4; the `updateProjectDefaults` description). It is therefore not a launch-invalidating policy revision: no run or attempt reads the project defaults after its creation, so `updateProjectDefaults` writes no current revision and fences no launch. The plugin identifiers are stored as given, checked only as `Identifier` values and the 1 to 8 distinct implementers of `HarnessPreference`; the document declares no status for an unregistered plugin ("Open questions").

### 5. Auto-merge setting

`createProject` stores the setting on at revision 1 in the same transaction as the project (product ports section 6.2), and `readAutoMergeSetting` reads it. The table `auto_merge_settings` is created by this change and written only at project creation. Item 23 implements the Integrations port `AutoMergeSettings` over the same table with its change and the push standing rule; until then the `Access` store owns the one initial write, the only writer of that table, which item 23 moves behind the Integrations port (coordinator decision Q3).

### 6. Pages

`listProjects` and `listProjectMembers` return at most 100 items in the code-unit order of their key, the project and the principal identifier, with `next`, the last key of the page, while more remain (section 6). The store reads one item more than the page to know whether more remain. PostgreSQL compares keys `COLLATE "C"`. An `after` that is not an `Identifier` answers 400.

### 7. Persistence

One migration, `packages/adapters/postgres/migrations/1792933800000_project-setup.sql`, after `1792933500000_slot-credential-stored-at.sql` (the brief reserves `1792933600000` for 12f and `1792933700000` for 20e):

- `projects(project_id text PRIMARY KEY CHECK (project_id ~ '^p[0-9a-f]{32}$'), name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 1024), created_at timestamptz NOT NULL, revision integer NOT NULL CHECK (revision >= 1))`.
- `project_defaults(project_id PRIMARY KEY REFERENCES projects, framework_plugin_id, implementers text[] CHECK (cardinality BETWEEN 1 AND 8), reviewer, spec_approver CHECK IN the two approvers, no_eligible_slot CHECK IN ('wait', 'reject'), revision, changed_by, changed_at)`, with both change columns null or neither.
- `auto_merge_settings(project_id PRIMARY KEY REFERENCES projects, enabled boolean NOT NULL, revision, changed_by, changed_at)`, the same pair rule.
- `project_roles` gains the foreign key `project_roles_project` to `projects`, added `NOT VALID`: a role that an installation assigned with `assign-project-role` on a G2 project identifier before this migration stays and keeps its meaning for the G2 operations, such as the evidence reads of that project, while every role written from now on must name a project. A validated key would make the migration fail on such a row, and deleting the rows would silently revoke access.
- `changed_by` holds a principal identifier without a foreign key, as `access_audit_events` does, so that the down migration of `1792932800000_operator-access.sql`, which the migration tests run on a fully migrated database, can still drop `principals`.
- The down migration drops the foreign key and the three tables.

The PostgreSQL store is `packages/adapters/postgres/src/project-repositories.ts`, part of `PostgresAccessTransaction`, so it runs in the access store's SERIALIZABLE transactions with their retries. A role assignment inserts from `projects` and `principals` in one statement, so an unknown principal or project writes nothing and is told apart by one more read.

### 8. Audit

Project commands append to the access audit trail in their transaction: `access.project-created`, `access.project-renamed`, and `access.project-defaults-changed`, with the project, the actor, and the reason; member commands keep item 10's `access.project-role-assigned` and `access.project-role-removed`. Over HTTP the actor is the caller's principal identifier and the reason names the operation (`control-plane API createProject`). No event carries a credential.

### 9. Wire mapping

`apps/control-plane/src/api/project-api.ts` maps the operations to the services and the module's values to the document's shapes; `routes.ts` gains the ten routes, with `PUT` and `PATCH` as route methods, on both listeners like the agent session routes, accepting the session cookie with the CSRF header on a mutation, or the operator bearer, as each operation's `security` declares. Every success body is validated against its schema before it leaves, as for every route.

## Coordinator decisions

Niki answered the brief's questions on 2026-11-03:

- **Q1. Size.** Split: this change is 11a `implement-project-setup` (projects, members, defaults, with `listProjects` and `readProject`); 11b binds the repository later.
- **Q2. Repository binding.** `readRepositoryBinding` and `bindRepository` go to 11b, because `bindRepository` needs an SCM integration store that no plan item owns yet; Niki raises that gap with the owner.
- **Q3. Auto-merge.** 11a serves only `readAutoMergeSetting` with the initial on setting; `updateAutoMergeSetting` stays with item 23.

## Open questions

For Niki; none blocks this change, whose scope the brief fixes.

- **G2 bridge.** The living requirement "Temporary G2 bridge" says item 11 removes it. Removing it now would refuse the owner bearer on `createRun`, `submitTask`, `readAdmission`, and `readTaskResult` unless it holds a role on the run's project, and G2 runs name project identifiers that are not projects, on which no role can be assigned any more. Options: (a) keep it until a change makes `createRun` name an existing project, then retire it with the 403 that the G2 documents still do not declare; (b) retire it in 11b; (c) retire it here and assign the owner roles in the G2 scenarios. Recommendation: (a), as its own small change after 11b.
- **Plugin identifiers.** The defaults name SDLC framework and harness plugins by identifier, and the document declares no 404 or 422 for an unregistered one on `createProject` or `updateProjectDefaults`. This change stores them as given. Options: (a) keep that and check registration where a task is created from the defaults (items 15 and 25); (b) add a 422 reason in a contract change. Recommendation: (a).

## Test plan

- Module (in-memory store): the new conformance cases (creation at revision 1 with auto-merge on, pages in code-unit order for all and for a member, compare-and-set of the name and of the defaults with one winner of two concurrent renames, member pages with login names, an assignment on an unknown project); `ProjectSetupService` and the member commands: no member after creation, owner-only creation, refused and invalid commands write nothing, the owner's list and a member's list in pages of 100, maintainer-only changes with 409 for a stale revision, members by identifier, removal of a non-member, a project that does not exist for the administrative command, member pages, and the checks of names and defaults.
- PostgreSQL: the same conformance cases through `make test`; the migration keeps an earlier role on a G2 project identifier, refuses a new one without a project, checks its values, and its down migration removes the tables and the foreign key.
- HTTP (`apps/control-plane/test/project-routes.test.ts`, the real session, role, and hashing path over the in-memory store): 401 without a credential; the identical 403 for an existing and a missing project before the body; owner-only commands refused to every project role; reads by every role and the owner, changes only by the maintainer; the created project's answers; 404 for the owner on a missing project or principal; compare-and-set with 409 and one winner of two concurrent updates; `listProjects` for the owner, a member, and a non-member, with `after`; member assignment, replacement, listing, and removal, applied on the next request; the CSRF rejection; and schema violations answered 400 after the role check, recording nothing.
- Route table: `access-requirements.test.ts` checks that the served operations of the document, now with these ten, accept the schemes the document declares.
- Coverage: the new files reach at least 75% of lines, branches, and functions under `make verify`.

## Review checklist

The brief's checklist (`checklist.json`, dev `a21913f1`, size L) ranks contract-drift, missing-fail-before-test, docs, error-handling, concurrency-race, spec-wording, and naming; for records evidence-mismatch, spec-wording, docs, stale-citation, contract-drift, process, and missing-fail-before-test. How this change meets them: the routes' schemes are checked against the document and every success body against its schema (contract-drift); `verification.md` records each new test failing against the base implementation and against named mutations of the guards (missing-fail-before-test); failures map to the statuses each operation declares, with the in-transaction denial answered 403 (error-handling); compare-and-set is one conditional update in a SERIALIZABLE transaction, with a test of two concurrent renames (concurrency-race); one term per concept, `project`, `defaults`, `member`, `revision` (naming); citations name files and sections, not lines (stale-citation).

## Risks / Trade-offs

- The `NOT VALID` foreign key leaves earlier roles on G2 project identifiers unchecked until a later change validates or removes them.
- The `Access` store writes the initial auto-merge row that item 23 moves behind the Integrations port; until then two modules' concepts share one transaction, deliberately and only at creation.
- The G2 bridge stays ("Open questions"), so the owner bearer keeps its G2 reach.

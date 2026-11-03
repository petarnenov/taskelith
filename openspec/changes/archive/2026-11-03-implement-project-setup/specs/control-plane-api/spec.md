## ADDED Requirements

### Requirement: Project operations served
The control plane SHALL serve `listProjects`, `createProject`, `readProject`, `updateProject`, `listProjectMembers`, `assignProjectMember`, `removeProjectMember`, `readProjectDefaults`, `updateProjectDefaults`, and `readAutoMergeSetting` as `control-plane.openapi.json` declares them, with the roles of control-plane wire contracts section 3, checked before the body.

#### Scenario: Missing and existing project alike
- **WHEN** a principal that lacks the role an operation requires on a project calls it, once for an existing project and once for a missing one, the principal being no `installation-owner` on a read
- **THEN** both answers are the identical 403 `role-required` denial, and nothing is recorded

#### Scenario: Owner learns a missing project
- **WHEN** an `installation-owner` reads a project that does not exist
- **THEN** the answer is 404 `not-found`

#### Scenario: Owner without a project role
- **WHEN** an `installation-owner` without a role on a project calls `updateProject` or `updateProjectDefaults`
- **THEN** the answer is 403 `role-required` naming `project-maintainer`

### Requirement: Project creation without members
`createProject` SHALL create a project with a minted identifier, its name, its defaults at revision 1, and its auto-merge setting on at revision 1, and SHALL give no principal a role, its creator included.

#### Scenario: New project
- **WHEN** an `installation-owner` creates a project
- **THEN** the answer is 201 with revision 1, the project lists no member, its defaults have revision 1 without `changedBy`, and its auto-merge setting is enabled at revision 1

### Requirement: Project changes by compare-and-set
`updateProject` and `updateProjectDefaults` SHALL change the project only at the revision they name, increment it, and answer 409 `conflict` otherwise; a defaults change SHALL record its principal and time and apply to tasks created afterwards only.

#### Scenario: Stale revision
- **WHEN** a `project-maintainer` sends an expected revision that is not the current one
- **THEN** the answer is 409 `conflict` and nothing changes

#### Scenario: Concurrent updates
- **WHEN** two updates name the same current revision at once
- **THEN** exactly one succeeds and the other answers 409 `conflict`

### Requirement: Project members managed by the installation-owner
`assignProjectMember` SHALL replace the principal's one role on the project and answer 404 for an unknown project or principal; `removeProjectMember` SHALL answer 204 also for a principal that is no member, and 404 for an unknown project. A role change SHALL apply to the principal's next request.

#### Scenario: Removal of a non-member
- **WHEN** an `installation-owner` removes a principal that holds no role on an existing project
- **THEN** the answer is 204 and no audit event is written

### Requirement: Projects listed by membership
`listProjects` SHALL return every project to an `installation-owner` and to any other principal the projects on which it holds a role; it and `listProjectMembers` SHALL return at most 100 items in code-unit order of their identifier, with `next` while more remain.

#### Scenario: Member's list
- **WHEN** a principal with a role on one of several projects calls `listProjects`
- **THEN** the answer holds only that project

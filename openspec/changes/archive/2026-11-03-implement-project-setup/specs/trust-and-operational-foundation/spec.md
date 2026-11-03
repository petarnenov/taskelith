## ADDED Requirements

### Requirement: Projects behind the Access port
The `Access` module SHALL keep projects, their defaults, and their initial auto-merge setting behind its `AccessStore` port with conformance cases, and SHALL check the actor's role again inside each project or member command's transaction, so a role removed meanwhile writes nothing.

#### Scenario: Role lost before the command
- **WHEN** a project command's actor lacks the required role in the command's transaction
- **THEN** it fails with `forbidden` and reason `role-required`, and writes no change or audit event

### Requirement: Project roles on existing projects only
A project role SHALL be assigned only on an existing project, through `assignProjectMember` and the administrative `assign-project-role` command alike; a role assigned before projects existed SHALL keep its meaning, and `remove-project-role` SHALL remove it.

#### Scenario: Unknown project
- **WHEN** an `installation-owner` assigns a role on a project identifier that names no project
- **THEN** the command fails with `not-found` and writes nothing

#### Scenario: Role from before projects removed
- **WHEN** an `installation-owner` removes with `remove-project-role` a role on a project identifier that names no project
- **THEN** the role is removed, the principal loses that access, and the removal is audited

## MODIFIED Requirements

### Requirement: Temporary G2 bridge
Until `createRun` requires an existing project, an `installation-owner` SHALL also pass the project requirements of the G2 execution and SDLC operator operations, through one requirement kind of the `Access` module named as the bridge. This requirement is temporary; sub-change 11c of item 11 SHALL remove it.

#### Scenario: Owner on a G2 operation
- **WHEN** an `installation-owner` without a project role calls a G2 operation that requires `project-operator`
- **THEN** the bridge passes it, while another principal without the role is denied with `role-required`

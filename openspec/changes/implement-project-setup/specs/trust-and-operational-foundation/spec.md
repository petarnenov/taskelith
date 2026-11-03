## ADDED Requirements

### Requirement: Projects behind the Access port
The `Access` module SHALL keep projects, their defaults, and their initial auto-merge setting behind its `AccessStore` port with conformance cases, and SHALL check the actor's role again inside each project or member command's transaction, so a role removed meanwhile writes nothing.

#### Scenario: Role lost before the command
- **WHEN** a project command's actor lacks the required role in the command's transaction
- **THEN** it fails with `forbidden` and reason `role-required`, and writes no change or audit event

### Requirement: Project roles on existing projects only
A project role SHALL be assigned only on an existing project, through `assignProjectMember` and the administrative `assign-project-role` command alike; a role assigned before projects existed SHALL keep its meaning.

#### Scenario: Unknown project
- **WHEN** an `installation-owner` assigns a role on a project identifier that names no project
- **THEN** the command fails with `not-found` and writes nothing

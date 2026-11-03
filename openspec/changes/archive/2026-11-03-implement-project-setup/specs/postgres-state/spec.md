## ADDED Requirements

### Requirement: Project setup tables
The adapter SHALL keep projects, their defaults, and their auto-merge setting in their own tables with checked values, each with its revision, and SHALL add a foreign key from `project_roles` to projects that checks every new role without refusing roles stored before it; its down migration SHALL remove them.

#### Scenario: Role stored before projects
- **WHEN** the migration runs on a database with a role on a project identifier that names no project
- **THEN** the role stays, and a new role on such an identifier is refused

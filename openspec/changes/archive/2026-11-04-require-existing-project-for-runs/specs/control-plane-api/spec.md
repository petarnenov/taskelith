## ADDED Requirements

### Requirement: Runs of existing projects
`createRun` SHALL create a run only for a project that exists, which `RunService` checks through its `ProjectDirectory` port, and SHALL answer 404 `not-found` for another project, after the role check and before the workflow check that answers 422. A project without a repository binding SHALL get a run; item 21's per-run credential issue re-checks the binding.

#### Scenario: Run of an unknown project
- **WHEN** `RunService` creates a run of a known workflow for a project identifier that names no project
- **THEN** it fails with `not-found`, which `createRun` answers 404, and no run is stored

#### Scenario: Run of an unbound project
- **WHEN** a `project-operator` creates a run of a project that has no repository binding
- **THEN** the answer is 201 with the run

### Requirement: Roles of the run operations
`createRun` and `submitTask` SHALL require `project-operator` or above on the run's project, with no pass for an `installation-owner`; `readAdmission` and `readTaskResult` SHALL require `project-viewer` or above, or `installation-owner`. A role refusal SHALL answer 403 `AccessDenial` with reason `role-required` and its `requiredRole`; a missing or wrong bearer SHALL stay 401.

#### Scenario: Owner without a project role
- **WHEN** the operator bearer, whose owner holds no role on the project, calls `createRun` or `submitTask`
- **THEN** the answer is 403 `role-required` naming `project-operator`, and nothing is created

#### Scenario: Owner reads a run's results
- **WHEN** the operator bearer, whose owner holds no role on the run's project, reads an admission or a task result of the run
- **THEN** the answer is 200

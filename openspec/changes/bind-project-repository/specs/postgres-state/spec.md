## ADDED Requirements

### Requirement: Repository binding table
Migration `1792934300000_project-repository-bindings` SHALL create `project_repository_bindings`, keyed by `project_id` with foreign keys to `projects` and `scm_integrations`, holding the repository, the remote URL, the integration branch, the merge method, and the revision, and SHALL drop it in its down migration. The store SHALL check the integration's revision and write the binding in one SERIALIZABLE transaction.

#### Scenario: Checked values
- **WHEN** a row names a missing project or integration, a merge method outside `MERGE_METHODS`, or a revision below 1
- **THEN** the insert fails on the table's constraint

## ADDED Requirements

### Requirement: Repository binding store
The integrations module SHALL keep at most one repository binding per project through the port `RepositoryBindings`, whose `put` applies the meaning of `nextBinding` and fails with `conflict` when the integration is missing or its revision differs from the given one. Every store SHALL pass `REPOSITORY_BINDINGS_CONFORMANCE`, also in memory.

#### Scenario: Concurrent first binds
- **WHEN** two first binds of one project run at once
- **THEN** exactly one succeeds and the other fails with `conflict`

#### Scenario: Integration revision moved
- **WHEN** `put` names an integration revision that an update has moved
- **THEN** it fails with `conflict` and the binding is unchanged

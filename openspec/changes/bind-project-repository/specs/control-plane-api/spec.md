## ADDED Requirements

### Requirement: Repository binding operations served
The control plane SHALL serve `readRepositoryBinding` and `bindRepository` as `control-plane.openapi.json` declares them, with the roles of wire contracts section 3 checked before the body: a read needs a project role or `installation-owner`, and a bind needs `project-maintainer`. A read SHALL return the binding as stored, with no re-check, and 404 for an unbound project.

#### Scenario: Refusals before the body
- **WHEN** a request has no credential, a principal without the required role calls either operation for an existing or a missing project, or a browser binds without its CSRF header
- **THEN** the answers are 401, the identical 403 `role-required`, and 403 `csrf-token-invalid`, and nothing is stored

#### Scenario: Owner without the maintainer role
- **WHEN** an `installation-owner` without a role on the project binds it
- **THEN** the answer is 403 `role-required` naming `project-maintainer`, and a read by that owner answers 200 or 404

### Requirement: Repository binding by compare-and-set
A first bind SHALL name no expected revision and fail with 409 on a bound project; a later bind SHALL name the current revision and fail with 409 when it moved. Any field MAY change. A bind at the current revision that changes nothing SHALL answer 200 and keep the revision.

#### Scenario: Same binding again
- **WHEN** a maintainer sends the stored binding again with its current revision
- **THEN** the answer is 200 with that binding at the same revision

#### Scenario: Stale revision
- **WHEN** a bind names a revision that another bind already moved
- **THEN** the answer is 409 and the binding is unchanged

### Requirement: Remote URL resolution failures
`bindRepository` SHALL resolve the remote URL through the integration's plugin and answer: 404 for an unknown project or integration; 503 for an integration whose plugin is not registered or cannot be built, or a resolver `unavailable`; 422 `repository-not-visible` for `not-found`; 422 `integration-credential-refused` for `forbidden`; 400 for `invalid`; and 500 for any other code or a resolved value that is not a `RemoteUrl` of the requested repository.

#### Scenario: Repository the plugin cannot see
- **WHEN** the plugin's resolver fails with `not-found`
- **THEN** the answer is 422 `precondition-failed` with reason `repository-not-visible`, never 500, and nothing is stored

#### Scenario: Malformed resolved URL
- **WHEN** the plugin resolves a remote URL with user information
- **THEN** the answer is 500 and nothing is stored

### Requirement: Binding against a current resolution
The resolver call SHALL run before and outside the store's transaction. Inside it, the store SHALL check that the integration still exists at the revision the service resolved against, and otherwise fail with 409, so that no binding is stored against a stale resolution. The merge method SHALL be one that the plugin's capabilities declare.

#### Scenario: Integration changed during the resolution
- **WHEN** the integration's revision moves after the resolver answered and before the binding is stored
- **THEN** the answer is 409 and the project's binding is unchanged

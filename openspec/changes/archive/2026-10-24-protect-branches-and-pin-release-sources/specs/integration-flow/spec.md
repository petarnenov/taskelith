## ADDED Requirements

### Requirement: Protected promotion branches
The `main` branch SHALL accept changes only through a pull request whose `verify` check passed on an up-to-date branch, with administrators included and force pushes and deletion blocked; the `dev` branch SHALL block force pushes and deletion; and squash merging SHALL be disabled for the repository.

#### Scenario: Direct push to main
- **WHEN** anyone, including an administrator, pushes a commit directly to `main`
- **THEN** GitHub rejects the push

#### Scenario: Promotion without a passing check
- **WHEN** a pull request into `main` has a failing or missing `verify` check
- **THEN** it cannot be merged

#### Scenario: Squash merge attempted
- **WHEN** a pull request is merged
- **THEN** only a merge commit or a rebase merge is offered

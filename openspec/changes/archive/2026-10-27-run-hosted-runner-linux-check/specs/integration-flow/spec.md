## MODIFIED Requirements

### Requirement: Promotion flow and releases
`dev` SHALL be the default branch for development; GitHub SHALL run the release workflow only for pull requests into `main`, pushes to `main`, and manual dispatch, and any other workflow, such as the Linux acceptance workflow, only on manual dispatch; promotions from `dev` to `main` SHALL use a merge commit or rebase, not a squash; and pushes to `main` SHALL keep releasing qualifying Conventional Commits.

#### Scenario: Push to dev
- **WHEN** a commit is pushed to `dev`
- **THEN** no workflow run starts

#### Scenario: Promotion merged
- **WHEN** a promotion pull request from `dev` is merged into `main` with a merge commit
- **THEN** `make verify` runs and the release job analyzes every promoted Conventional Commit

#### Scenario: Linux acceptance workflow
- **WHEN** a commit is pushed to `main` or a pull request into `main` is opened
- **THEN** the Linux acceptance workflow does not start; it starts only when someone dispatches it manually

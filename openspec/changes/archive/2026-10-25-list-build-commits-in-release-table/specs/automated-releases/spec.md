## MODIFIED Requirements

### Requirement: Automatic semantic versions
The release workflow SHALL calculate versions from Conventional Commits since the latest release tag on main.

#### Scenario: Fix, feature, and breaking change
- **WHEN** commits contain fix, feat, or a breaking change
- **THEN** the version advances by patch, minor, or major respectively, with the highest applicable increment winning

#### Scenario: Non-release changes
- **WHEN** only docs, test, chore, build, or ci commits exist without breaking changes
- **THEN** no package version is published

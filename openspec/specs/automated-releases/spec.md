# automated-releases Specification

## Purpose
Version and publish the npm package automatically from Conventional Commits on main through GitHub Actions OIDC, gated on tests, strict OpenSpec validation, and installed tarball verification.

## Requirements

### Requirement: Automatic semantic versions
The release workflow SHALL calculate versions from Conventional Commits since the latest release tag on main.

#### Scenario: Fix, feature, and breaking change
- **WHEN** commits contain fix, feat, or a breaking change
- **THEN** the version advances by patch, minor, or major respectively, with the highest applicable increment winning

#### Scenario: Non-release changes
- **WHEN** only docs, test, or chore commits exist without breaking changes
- **THEN** no package version is published

### Requirement: Trusted publication
The workflow SHALL publish using npm OIDC without stored npm credentials or per-release MFA prompts.

#### Scenario: Verified main change
- **WHEN** all verification gates pass on main and npm trusts release.yml
- **THEN** the workflow publishes the version, provenance, tag, and GitHub release notes

#### Scenario: Untrusted event or failed verification
- **WHEN** the event is a pull request or verification fails
- **THEN** the release job does not run

### Requirement: Package verification
The verification job SHALL inspect and install the packed CLI before allowing publication.

#### Scenario: Executing the packed CLI
- **WHEN** the tarball is installed outside the checkout
- **THEN** help, manifest version, bundled plan, and invalid usage behave correctly

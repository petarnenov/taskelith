## Why

The owner requested automatic versioning and publishing without entering MFA for every release. npm is deprecating direct publication with 2FA-bypass tokens. Tracking: https://github.com/petarnenov/taskelith/issues/2.

## What Changes

- Use established OSS semantic-release to calculate versions from Conventional Commits on main.
- Publish through GitHub Actions OIDC, without npm publish secrets.
- Gate releases on tests, strict OpenSpec validation, and installed tarball verification.
- Document the one-time npm trust setup and recovery procedure.

## Capabilities

### New Capabilities
- `automated-releases`: Automatic semantic versions and trusted npm publication.

### Modified Capabilities

None.

## Impact

Development dependencies, GitHub Actions, release configuration, and documentation. The owner authorizes configuring automated releases. Account authentication may require a one-time owner interaction. No product orchestration functionality is added.

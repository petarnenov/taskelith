## Why

The owner asked to continue the remaining G0 work until an owner decision is required. The dependency inventory still lists 14 paths without detected license text and two development audit findings in the release plugin's bundled npm. Neither has been examined beyond detection. A gap that is reviewed once can also silently drift when a manifest changes.

## What Changes

- Review each of the 14 paths against its published tarball, installed files, and upstream source at the published version, and retain the result in `docs/dependencies/license-reviews.json`.
- Fail inventory generation and check mode when a gap has no matching review or a review no longer matches a gap, keyed by path, version, and installed manifest hash.
- Assess upstream remediation of the two bundled advisories across the release plugin and npm release lines, and record the result in the dependency documentation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `dependency-inventory`: Reviewed license coverage gaps that are bound to exact manifests.

## Impact

Development scripts, tests, retained evidence, and documentation. No dependency version, lockfile, product runtime behavior, publication, or deployment changes. Sufficiency of notice-only and declaration-only evidence, and interim acceptance of the advisories, remain owner decisions.

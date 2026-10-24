## Why

The owner requested autonomous continuation until an owner decision is required. G0 needs a retained, reproducible dependency/license inventory and SBOM against the exact CI toolchain. Prior generation used a different local npm and retained no artifact.

## What Changes

- Add a TypeScript inventory command using the existing npm CycloneDX generator.
- Capture every lockfile installation path, bundled manifests, license/notice file hashes, unresolved coverage, and source/toolchain hashes.
- Retain normalized SBOM and license inventory, detect drift in CI, and document regeneration.
- Assess remediation of the known bundled release-tool vulnerabilities without silent dependency upgrades.

## Capabilities

### New Capabilities
- `dependency-inventory`: Reproducible dependency evidence with explicit bundled-license coverage.

### Modified Capabilities

None.

## Impact

Development scripts, tests, evidence, CI verification, and documentation. No product runtime behavior, publication, or production deployment changes. Exact toolchain availability and unresolved qualification findings remain explicit gates.

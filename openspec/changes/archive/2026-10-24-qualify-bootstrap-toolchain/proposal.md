## Why

The owner authorized continuation after accepting the SDLC policy. The next recorded G0 task is a dependency decision register and qualification assessment of the installed toolchain. Existing pins and successful tests do not establish full OSS admission.

## What Changes

- Inventory direct development tools and the separate CI/runtime tool versions.
- Record registry metadata, licenses, runtime requirements, maintenance observations, security reporting, operational checks, and explicit admission gaps.
- Add a TypeScript helper that collects only public registry metadata for the pinned tools.
- Document reproducible audit, license inventory, and npm-native SBOM generation.
- Keep unqualified infrastructure and integrations as candidates.

## Capabilities

### New Capabilities
- `dependency-register`: Version-specific dependency decisions with evidence and outstanding gates.

### Modified Capabilities

None.

## Impact

Documentation, metadata evidence, and a development-only collection helper. No product runtime behavior, installed dependency, lockfile, release policy, or deployment changes. This assessment does not silently accept legacy bootstrap tools under the stricter architecture policy.

## Context

Nine direct development dependencies are pinned. Node and the CI npm CLI are pinned separately; the npm release plugin contains another npm version. These are distinct qualification targets.

## Goals / Non-Goals

Provide a concrete register and current assessment with reproducible evidence. Do not upgrade dependencies, implement a scanner, select runtime services, or claim complete legal/security qualification.

## Decisions

Use installed manifests and package-lock integrity for exact installed facts, and npm registry metadata for release observations. Link official operational/security sources. Mark missing evidence as a remaining admission gate instead of using popularity as proof. Use the existing npm SBOM generator rather than introducing a dependency.

Provide a development-only TypeScript collector with bounded requests to the public npm registry. Read the npm version from both CI jobs and reject divergent pins. Write JSON to stdout only after all lookups succeed; changing a registry latest tag never updates the project's dependency selections.

## Risks / Trade-offs

Upstream branches and registry latest tags change; preserve the checked date and selected metadata snapshot. A lockfile license field is a declaration rather than a license-text review. npm SBOM components deduplicate packages and need not equal lockfile installation paths. Existing CI publication evidence is historical, not a new qualification run.

## Context

The lockfile contains bundled npm modules, a legacy license field, and repeated installations of the same package. A deduplicated SBOM alone cannot prove license-file coverage.

## Goals / Non-Goals

Retain reproducible dependency identities and available license evidence while reporting omissions. Do not implement a license classifier, certify license compliance, patch vendor bundles, or treat an audit finding as a passed security gate.

## Decisions

Use npm's built-in CycloneDX generator with the lockfile as source. Normalize only volatile timestamp/serial identifiers, preserving package identities and graph edges. Collect package manifests and top-level license/copying/notice files for each locked installation path. Record SHA-256 content hashes and unresolved entries rather than assuming the package license covers all bundled code. Require exact Node/npm CI pins for regeneration/checks. Hash the lockfile and scripts in the evidence provenance; never capture the environment or credential configuration.

## Risks / Trade-offs

License file presence and declared SPDX identifiers are evidence, not legal interpretation. Some packages rely on repository or parent notices, which require follow-up. npm's dependency SBOM excludes the global toolchain binary contents. Normalization must not discard dependency relationships or package metadata. Tests exercise missing and legacy license cases and drift detection.

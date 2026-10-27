# dependency-inventory Specification

## Purpose
Retain a reproducible dependency inventory, SBOM, and per-path license evidence under the exact CI toolchain, with every license coverage gap reviewed and bound to its manifest.

## Requirements

### Requirement: Reproducible retained inventory
The development inventory command SHALL use the pinned CI Node/npm versions, retain a normalized npm-generated CycloneDX SBOM and per-installation license evidence, and detect drift without overwriting evidence in check mode.

#### Scenario: Dependency inputs change
- **WHEN** the lockfile or installed license evidence differs from retained inventory
- **THEN** check mode fails and requires explicit regeneration and review

### Requirement: Honest bundled coverage
The inventory SHALL include bundled lockfile paths and legacy license declarations, hash discovered license/notice text, and list missing declarations or local texts as unresolved coverage.

#### Scenario: Package has only legacy license metadata
- **WHEN** a bundled package declares licenses through its legacy manifest field
- **THEN** the inventory preserves the declaration and available text evidence without reporting complete license compliance

### Requirement: No local secrets in evidence
The retained evidence SHALL contain dependency identities, public package metadata, relative dependency paths, hashes, and tool versions, without environment values, credentials, or absolute workstation paths.

#### Scenario: Inventory runs on another workstation
- **WHEN** identical supported inputs and package contents are inspected under another checkout path
- **THEN** retained dependency evidence remains independent of the workstation path

### Requirement: Reviewed license coverage gaps
Every inventory path with a license coverage gap SHALL have exactly one retained review keyed by path, version, and installed manifest hash, with a descriptive status, a finding, and at least one evidence source. Inventory generation and check mode SHALL fail when reviews and gaps do not match exactly.

#### Scenario: Gap package manifest changes
- **WHEN** a reviewed gap path's installed manifest hash or version changes
- **THEN** the inventory command fails, reporting the path as unreviewed and the prior review as stale

#### Scenario: Review is incomplete
- **WHEN** a review has an unknown status, no finding, or no evidence
- **THEN** the inventory command fails instead of treating the gap as reviewed

### Requirement: Evidence status is not admission
A license coverage review SHALL describe located evidence only. It SHALL NOT mark a dependency accepted or state legal compliance.

#### Scenario: Only a manifest declaration exists
- **WHEN** no license text is located in the package or in upstream source at the published version
- **THEN** the review records `declaration-only` and the sufficiency decision remains open

### Requirement: Inventory merge driver
The repository SHALL route `docs/dependencies/licenses.json` and `docs/dependencies/sbom.cdx.json` through a merge driver that keeps the current branch's version when both sides changed a file, and `make setup` and `make hooks` SHALL configure it.

#### Scenario: Both branches regenerated the inventory
- **WHEN** a branch whose inventory changed merges another branch whose inventory also changed
- **THEN** both inventory files merge without a conflict and keep the current branch's version

### Requirement: Stale inventory report
A `post-merge` hook SHALL compare the inventory's recorded provenance hashes with the merged inputs without running npm, and SHALL report every changed input with the remedy `make dependency-inventory` without blocking the merge. Check mode SHALL fail with the same report before its full drift check. `make dependency-inventory` SHALL reinstall the locked dependencies and regenerate both files under the pinned toolchain. Both checks SHALL use only Node.js built-ins.

#### Scenario: Merged inputs differ from the kept inventory
- **WHEN** the merged package manifest, lockfile, Node pin, or generator sources differ from the provenance recorded in the kept `licenses.json`
- **THEN** the `post-merge` hook and `make verify` name the changed inputs and `make dependency-inventory`, and `make verify` fails until the files are regenerated

#### Scenario: Merged inputs match the kept inventory
- **WHEN** every merged input matches the kept inventory's provenance
- **THEN** the hook reports nothing and the inventory check proceeds to its full drift check

### Requirement: Committed inventory before push
The `pre-push` hook SHALL refuse a push that it verifies, before it runs `make verify`, while the inventory files or their inputs have uncommitted changes, naming those paths, because `make verify` checks the working tree rather than the pushed commit; a push that only deletes refs runs no `make verify` and is not refused for them.

#### Scenario: Regenerated inventory left uncommitted
- **WHEN** a branch is pushed after `make dependency-inventory` while the regenerated files are not committed
- **THEN** the push is refused with the uncommitted paths and the remedy

#### Scenario: Unrelated uncommitted change
- **WHEN** only files outside the inventory and its inputs have uncommitted changes
- **THEN** the hook proceeds to `make verify`

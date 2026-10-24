## ADDED Requirements

### Requirement: Inventory merge driver
The repository SHALL route `docs/dependencies/licenses.json` and `docs/dependencies/sbom.cdx.json` through a merge driver that keeps the current branch's version when both sides changed a file, and `make setup` and `make hooks` SHALL configure it.

#### Scenario: Both branches regenerated the inventory
- **WHEN** a branch whose inventory changed merges another branch whose inventory also changed
- **THEN** both inventory files merge without a conflict and keep the current branch's version

### Requirement: Stale inventory report
A `post-merge` hook SHALL compare the inventory's recorded provenance hashes with the merged inputs without running npm, and SHALL report every changed input with the remedy `make dependency-inventory` without blocking the merge. Check mode SHALL fail with the same report before its full drift check. `make dependency-inventory` SHALL reinstall the locked dependencies and regenerate both files under the pinned toolchain.

#### Scenario: Merged inputs differ from the kept inventory
- **WHEN** the merged package manifest, lockfile, Node pin, or generator sources differ from the provenance recorded in the kept `licenses.json`
- **THEN** the `post-merge` hook and `make verify` name the changed inputs and `make dependency-inventory`, and `make verify` fails until the regenerated files are committed

#### Scenario: Merged inputs match the kept inventory
- **WHEN** every merged input matches the kept inventory's provenance
- **THEN** the hook reports nothing and the inventory check proceeds to its full drift check

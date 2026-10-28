## Why

ADR 0004 principle 6 requires that CI fails on an unversioned breaking change. `make contract-compatibility` (`scripts/check-contract-compatibility.ts`) accepts any number of breaking changes once `info.version` declares them, and while the major version is 0 one minor bump declares them all: G3 item 17 (`bind-evidence-to-code-head`) declared 306 breaking changes of the SDLC AsyncAPI document with one bump from 0.3.0 to 0.4.0, and nobody saw them one by one. The owner approved the fix on 2026-10-28, assigned by the coordinator's brief (Niki, 2026-10-28): a deterministic rule in `make verify` that does not depend on a reviewer.

## What Changes

- **Declaration file.** The tracked, hand-edited `packages/contracts/breaking-changes.json` lists, per contract document and per version that declared breaking changes, the version, a short English reason, and the exact breaking changes the check computes; entries of earlier versions stay as history. `packages/contracts/breaking-changes.schema.json` defines it.
- **Check.** When a document's head `info.version` declares a breaking change over its merge-base version (a higher major version, or a higher minor version while 0.x) and the check finds breaking changes, it fails unless the file lists exactly those changes for that path and version, naming each undeclared and each stale change. An entry for a version above the merge-base version that is not such a head version fails as stale; entries at or below it are history. A malformed file fails.
- **Listing.** `make contract-breaking-changes` (`--print`, optionally against `BASE`) prints the computed changes in the file's format and never writes the file.
- **Determinism.** Changes are deduplicated and sorted by UTF-16 code units, independent of the detectors' order, the locale, and the host; the pinned `OASDIFF_IMAGE` stays.
- **History seed.** One entry for the SDLC AsyncAPI document 0.4.0: the 306 changes against `9196804b`, the merge base item 17 declared them over.
- **Docs.** The author workflow in `docs/contracts/execution-wire-contracts.md` and the `Makefile`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sdlc-wire-contracts`: "Breaking-change declarations", "Declared breaking changes listed", "Stale and historical declarations", and "Breaking-change listing" added, next to its "Breaking-change check" (design decision 1).

## Impact

- `scripts/check-contract-compatibility.ts`, `test/check-contract-compatibility.test.ts`, `Makefile`.
- `packages/contracts` (private): `breaking-changes.json` and `breaking-changes.schema.json` (new); the contract documents do not change.
- `docs/contracts/execution-wire-contracts.md`.
- The published `taskelith` package does not change.
- Out of scope: version 1.0 of any contract, and changes to the contract documents.

## Why

G1 item 10 in the [G1 work plan](../../../docs/g1-plan.md). Before the SDLC framework port freezes (item 12), shared mapping fixtures from both native workflows must exist (architecture section 13, requirement R34): the OpenSpec adapter (item 11) has to pass them, and item 12 runs the SpecKit fixtures through a test-only normaliser. Items 6 (the draft port and its conformance suite) and 9 (the pinned SpecKit capture) are merged. The task was assigned by the coordinating session Niki.

## What Changes

- Add `packages/plugins/sdlc-openspec`, a fixture-only package: a fixture working copy with three changes copied byte for byte from this repository's archive (feature `draft-sdlc-framework-port`, fix `fix-boundary-entrypoint`, documentation `document-worktree-pitfalls`), the base specs their deltas modify, and the pinned CLI's instruction texts.
- Add `packages/plugins/sdlc-speckit`, a fixture-only stub package that G4 completes: a fixture working copy made of the pinned scaffold capture and three features (feature, fix, documentation) derived by hand from the pinned templates and labelled as derived, because no harness has run SpecKit's agent steps.
- In each package's tests, express the expected normalized outputs as cases of `runSdlcFrameworkConformance`, check them with the suite through a replaying stand-in, and check their provenance: digests against the fixture files, the OpenSpec changes against the archive and the pinned CLI, and the SpecKit scaffold against the capture.
- Document the provenance and the normalization rules in each package's `fixtures/README.md`.

Excluded: the OpenSpec adapter (item 11), the SpecKit normaliser and the port freeze (item 12), the SpecKit adapter (G4), changes to the port, the suite, or the boundary rules, and running SpecKit's agent steps.

## Capabilities

### New Capabilities
- `sdlc-mapping-fixtures`: shared feature, fix, and documentation fixtures for OpenSpec and SpecKit with expected normalized outputs in the port's result shapes.

### Modified Capabilities
None.

## Impact

Two new private workspace packages whose `src/index.ts` exports nothing; the lockfile gains their workspace links and no external dependency. Their tests run the pinned OpenSpec CLI locally with telemetry disabled. The published npm package is unchanged.

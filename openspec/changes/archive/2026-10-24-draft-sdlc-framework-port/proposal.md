## Why

G1 item 6 in the [G1 work plan](/docs/g1-plan.md). Architecture section 6 proposes an `SdlcFramework` port through which framework plugins discover work, resolve versioned workflows, describe artifacts and prerequisites, prepare stage instructions, inspect artifact revisions, validate structure, and finalize, returning typed results and evidence references rather than an approval boolean. The fixtures (item 10), the first adapter (item 11), and the freeze against both frameworks (item 12) need a draft port and a framework-neutral conformance suite to run against.

## What Changes

- Add a draft `SdlcFramework` port in `@taskelith/sdlc` under `src/ports/`: seven asynchronous operations that return kernel `Result` values in plain text shapes matching the item-4 inputs, evidence references in validation and finalization reports, and no operation that approves or decides a gate.
- Add a capability declaration: the optional operations a plugin supports (`validateStructure`, `finalize`) and the lifecycle obligations its native stages cover, with a parser; an undeclared operation fails with `unavailable`.
- Add a framework-neutral conformance-suite skeleton, `runSdlcFrameworkConformance`, that a plugin package's tests run with that package's fixtures and expected outputs. It reports findings for invalid capabilities, thrown errors, undeclared operations that do not fail with `unavailable`, outcomes that differ from the expected ones, and results that the module's domain parsers reject or that contradict the capability declaration.

Excluded: any adapter or plugin package (item 11), fixtures (item 10), the freeze and its ADR (item 12, decision D7 (a)), plugin registration and manifests (item 8), changes to the boundary rules, the other example ports of architecture section 6 (G2 and later), operation journals and cancellation for side-effecting CLI calls, and any I/O.

## Capabilities

### New Capabilities
- `sdlc-framework-port`: the draft `SdlcFramework` port, its capability declaration, and the framework-neutral conformance suite.

### Modified Capabilities
None.

## Impact

New files in `packages/modules/sdlc/src/ports/`, root exports in `src/index.ts`, and a new test file. No dependency is added, the lockfile is unchanged, and the published npm package is unchanged.

## Why

G1 item 4 in the [G1 work plan](/docs/g1-plan.md). Gates and transitions (item 5), the `SdlcFramework` port (item 6), and task admission (item 7) all need a framework-neutral model of what a workflow is and what a workflow run is bound to. Architecture section 6 requires workflows to be versioned stage graphs rather than one linear state enum, every lifecycle obligation to be covered natively or by a platform-managed stage, and each run to persist an immutable framework binding (invariant 12).

## What Changes

- Add the first module package, `@taskelith/sdlc` under `packages/modules/sdlc`, depending only on `@taskelith/kernel`, with its code in `src/domain/` and one root export.
- Define the six lifecycle obligations (intake, specification, implementation, review, verification, closure) and the two stage origins (native, platform-managed).
- Define a versioned workflow definition as a stage graph and validate it: at least one stage, valid and unique stage identities, valid obligations and origins, known dependencies without self-dependencies or duplicates, no dependency cycle, and every obligation covered by some stage.
- Define the workflow run binding: plugin identifier and version, upstream tool version, workflow identity, version, and digest, configuration revision, and policy revision.
- Define work-item identity (a stable platform identifier with the plugin's native reference) and artifact revisions (artifact identity, content digest, native reference), with revision identity by artifact and content.
- Every constructor parses untrusted text into branded, frozen values and returns a kernel `Result` with an `invalid` failure that names the field.

Excluded: gate states, evidence, and stage transitions (item 5); the `SdlcFramework` port and conformance suite (item 6); task admission and application services (item 7); workflow run aggregates, framework selection precedence, and switching; persistence and any I/O.

## Capabilities

### New Capabilities
- `sdlc-workflow-model`: the framework-neutral workflow definition, run binding, work-item identity, and artifact revision of the SDLC module.

### Modified Capabilities
None.

## Impact

New package `packages/modules/sdlc` (sources, tests, `package.json`, `tsconfig.json`), the workspace link in `package-lock.json`, and the dependency inventory's provenance hash of the lockfile if it changes. No runtime dependency is added, and the published npm package is unchanged.

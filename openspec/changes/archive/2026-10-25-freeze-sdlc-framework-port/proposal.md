## Why

G1 item 12 in the [G1 work plan](../../../docs/g1-plan.md): run the shared fixtures against both framework designs, revise the draft `SdlcFramework` port where they show a framework-specific or unstable shape, and freeze it as semantic version 1 (owner decision D7 (a)). Items 10 (the fixtures) and 11 (the OpenSpec adapter) are merged. The coordinating session Niki assigned the task with the owner's 2026-10-25 decision on port access: the plugin SDK re-exports the frozen port's types type-only.

## What Changes

- Add a test-only SpecKit normaliser to the `@taskelith/sdlc-speckit` stub package (`test/speckit-normaliser.ts`). It implements `SdlcFramework` with the type from the plugin SDK, reads the fixture working copy by the SpecKit normalization rules, and passes every SpecKit mapping case through `runSdlcFrameworkConformance`. It spawns no CLI.
- Revise the port. The SpecKit run showed no OpenSpec-specific operation or field. The work item, artifact revision, and workflow definition shapes become the port's own plain data types (`WorkItemData`, `ArtifactRevisionData`, `StageData`, `WorkflowDefinitionData`), so that a domain change cannot silently change the frozen port. Add `SDLC_FRAMEWORK_PORT_VERSION` `1.0.0` and remove the draft markers.
- Export the port through the module's port entry `@taskelith/sdlc/port`. The workspace package contract allows a `./port` export for module packages only.
- Re-export the port's types type-only from the `@taskelith/plugin-sdk` root. Record `PLUGIN_API_PORT_VERSIONS`, which the compiler ties to the port version, and raise `PLUGIN_API_VERSION` to `0.2.0`, so that registration rejects a plugin written for the draft port.
- Make the OpenSpec adapter implement the port type from the SDK, delete its structural copy `sdlc-framework-shapes.ts`, and declare `pluginApiRange` `^0.2.0`.
- Add a boundary rule: plugin SDK source may import a module package only type-only, through that module's port entry. Allow the port entry as the only workspace subpath import. Add tests for both.
- Record the freeze in ADR 0009: the version, the breaking-change rule, the fixture requirement, and port access. This closes the item 6 open question.
- Record the confirmed `archive --json` output in contract tooling section 9.

Excluded: the SpecKit adapter (G4), wire contracts (item 13), and UI.

## Impact

Private workspace packages, scripts, tests, and documentation. `@taskelith/plugin-sdk` gains a dependency on `@taskelith/sdlc`, and `@taskelith/sdlc-speckit` gains a development dependency on `@taskelith/plugin-sdk`. Only workspace entries in `package-lock.json` change, and no external dependency is added. The published npm package is unchanged.

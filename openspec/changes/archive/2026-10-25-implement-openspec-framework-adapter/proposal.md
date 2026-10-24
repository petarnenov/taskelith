## Why

G1 item 11 in the [G1 work plan](../../../docs/g1-plan.md): the OpenSpec plugin that implements the draft SDLC framework port through the pinned CLI (decision D6 (a)), registered through the plugin SDK, and passing the conformance suite on the OpenSpec mapping fixtures before the port freezes in item 12. Items 6 (the draft port and its conformance suite), 8 (`registerPlugin`), and 10 (the fixtures) are merged. The task was assigned by the coordinating session Niki.

## What Changes

- Add the adapter to `@taskelith/sdlc-openspec` `src/`: `OpenSpecFramework` implements every port operation by spawning the pinned `@fission-ai/openspec@1.14.3` CLI in the working copy with `OPENSPEC_TELEMETRY=0` and `DO_NOT_TRACK=1` and reading its `--json` output, following the normalization rules in `fixtures/README.md`.
- Add the plugin manifest and `registerOpenSpecFramework`, which admits the manifest through `registerPlugin` from `@taskelith/plugin-sdk` before it creates the framework.
- Satisfy the port structurally with local copies of its plain shapes, because plugin source cannot import `@taskelith/sdlc`; the tests assign the adapter to the real port type.
- Test the adapter with `runSdlcFrameworkConformance` and the item-10 cases, on a copy of the fixture working copy, with the CLI clock pinned to the archive date 2026-10-24, plus failure cases.

Excluded: the SpecKit normaliser and the port freeze (item 12), the resolution of plugin access to the port type (item 12), changes to the port, the suite, the fixtures' expected outputs, or the boundary rules, and any UI.

## Capabilities

### New Capabilities
- `openspec-framework-adapter`: the OpenSpec plugin that implements the SDLC framework port through the pinned OpenSpec CLI.

### Modified Capabilities
None.

## Impact

`@taskelith/sdlc-openspec` gains source and runtime dependencies on the private `@taskelith/kernel` and `@taskelith/plugin-sdk` workspace packages, which changes only workspace entries in `package-lock.json`; no external dependency is added. The plugin spawns the CLI that the composition root names; the tests use the repository's pinned CLI without network access. The published npm package is unchanged.

# ADR 0009: Frozen SDLC framework port, version 1

Date: 2026-10-25
Status: Decided by the owner. G1 decision D7 (a) of 2026-10-24 set what a frozen port means; on 2026-10-25 the owner decided that the plugin SDK gives plugins type-only access to the port. Recorded by G1 item 12 (`freeze-sdlc-framework-port`), which implements both on `dev`.

## Context

G1 item 6 drafted the `SdlcFramework` port and its framework-neutral conformance suite (`runSdlcFrameworkConformance`) in `@taskelith/sdlc`. Item 10 wrote shared mapping fixtures for OpenSpec 1.14.3 and SpecKit 1.2.3 that describe the same three changes, and item 11 implemented the OpenSpec adapter against them. The [G1 plan](../g1-plan.md) freezes the port only after both frameworks' fixtures pass through it.

Item 6 left one question open. The boundary check lets plugin source import only the kernel, the plugin SDK, and the contracts packages, so the OpenSpec adapter implemented the port through a structural copy of its shapes.

Item 12 ran the SpecKit fixtures through the conformance suite with a test-only normaliser in the `@taskelith/sdlc-speckit` stub package. The normaliser reads the fixture working copy as the SpecKit normalization rules define. Every SpecKit case passed without a change to an operation, a request, or a result field:

- A stage that produces several artifacts (SpecKit `plan`) fits the producing-stage field of an artifact requirement.
- Features named by their directory fit the explicit work item.
- The absent validator and closure fit the optional operations.
- Workflow gates fit platform-managed review stages.

One shape was not stable enough to freeze. The work item, artifact revision, and workflow definition shapes were the domain's input types; `WorkItemInput` is even mapped from the `WorkItem` domain type. A domain change would therefore have changed the frozen port without anyone noticing.

## Decisions

1. **Version 1.** The `SdlcFramework` port is frozen as semantic version 1.0.0 (`SDLC_FRAMEWORK_PORT_VERSION`). It has seven operations, its capability declaration, and its request and result shapes. The shapes are now the port's own plain data types (`WorkItemData`, `ArtifactRevisionData`, `StageData`, `WorkflowDefinitionData`) instead of the domain's input types. The domain parsers still accept them, so the compiler reports any divergence.
2. **Breaking changes.** A breaking change needs a new major port version. A breaking change is one that a plugin or the module could observe: a removed or renamed operation or field, a changed type or meaning, a new required field, a new operation that is not optional, or a narrower accepted input. It must pass the OpenSpec and SpecKit fixture sets before it merges, and it is recorded in an ADR. A compatible change, such as a new optional operation, raises the minor version.
3. **Fixtures.** The OpenSpec fixtures run through the OpenSpec adapter, and the SpecKit fixtures run through the SpecKit normaliser or, from G4, through the SpecKit adapter. Both run with the framework-neutral conformance suite in `make verify`.
4. **Port access.**
   - The SDLC module exports its frozen port through a port entry, `@taskelith/sdlc/port`. The entry holds the port's types and constants and none of the module's domain or application code. The workspace package contract allows this second export only for module packages.
   - `@taskelith/plugin-sdk` re-exports the port's types type-only, by name, from its root export. Plugins write `implements SdlcFramework` with the type from the SDK. The OpenSpec adapter's structural copy is deleted.
   - The boundary check lets plugin SDK source import a module package only with `import type` or `export type`, and only through that module's port entry.
5. **Version tie.** The plugin SDK records the port versions that its plugin API version carries (`PLUGIN_API_PORT_VERSIONS`). The compiler ties that record to the port's version constant. A new major port version needs a breaking plugin API version: the minor version while the API is below 1.0, the major version after that. Registration then rejects a plugin whose `pluginApiRange` was written for another port version. The freeze raises the plugin API from 0.1.0 to 0.2.0, so a plugin written for the draft port (`^0.1.0`) is rejected, and the OpenSpec manifest declares `^0.2.0`.

## Consequences

- Item 6's open question is closed by option (2): access goes through the plugin SDK, and the plugin import rule is unchanged.
- The plugin SDK depends on `@taskelith/sdlc` for types only. A future module port follows the same pattern: a port entry, type-only re-exports, and an entry in `PLUGIN_API_PORT_VERSIONS`.
- The full SpecKit adapter, including spawning its CLI and agent steps, belongs to G4. Wire contracts belong to G1 item 13.

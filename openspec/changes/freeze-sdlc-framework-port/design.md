## Context

The draft port (item 6) and its conformance suite live in `@taskelith/sdlc`. Item 10 wrote fixtures for OpenSpec 1.14.3 and SpecKit 1.2.3 that describe the same three archived changes. Item 11's OpenSpec adapter passes the OpenSpec cases. Plugin source may import only the kernel, the plugin SDK, and the contracts packages, so the adapter carried a structural copy of the port. Item 6 left that access as an open question, and the owner decided it on 2026-10-25.

## Goals / Non-Goals

Goals:

- Run the SpecKit fixtures through the framework-neutral suite.
- Revise and freeze the port as version 1.
- Give plugins the port type through the SDK, and tie the port version to registration.

Non-goals: the SpecKit adapter and its CLI (G4), wire contracts, and UI.

## Decisions

- **Normaliser, test-only.** `SpecKitNormaliser` lives in the stub package's `test/`, so it ships no product code and needs no coverage scope. It reads only files:
  - work items: the feature directories under `specs/`;
  - workflow: the bundled workflow's step identifiers and gate markers, its version from the workflow registry, the SHA-256 of `workflow.yml`, and the tool version from `.specify/integration.json`;
  - artifacts and revisions: `spec.md`, `plan.md`, and `tasks.md`;
  - instructions: the command prompts in the integration's commands directory.

  `validateStructure` and `finalize` fail with `unavailable`. The step reader matches the pinned file's layout instead of parsing YAML, because G4 owns the real adapter and adding a YAML parser is a dependency decision. The replay test stays, so that the expected outputs are checked apart from the normaliser.
- **What the SpecKit run showed.** Every SpecKit case passed without a change to an operation, a request, or a result field:
  - a stage with several outputs (`plan`) fits the producing-stage field;
  - features named by directory fit the explicit work item;
  - the absent validator and closure fit the optional operations;
  - workflow gates fit platform-managed review stages.

  The only revision is for stability. The port's work item, revision, and workflow shapes were the domain's input types, and `WorkItemInput` is mapped from `WorkItem`. They become the port's own `*Data` interfaces. The conformance suite still hands them to the domain parsers, so the compiler reports a divergence.
- **Port entry.** `src/port.ts` re-exports the port's types and its two constants (`SDLC_FRAMEWORK_PORT_VERSION` and `OPTIONAL_SDLC_OPERATIONS`), and nothing from the domain. The capability parser stays in the root export. The workspace package contract allows the extra `./port` export only under `packages/modules/`. The build then requires `dist/port.js` and `dist/port.d.ts`.
- **SDK re-export.** The plugin SDK root re-exports the port types by name with `export type`. A subpath of the SDK would break the rule that a plugin imports a workspace package only through its root export. The SDK has a runtime dependency on `@taskelith/sdlc`, because its declaration files reference the port entry, but it loads no module code.
- **Version tie.** `PLUGIN_API_PORT_VERSIONS` in the SDK has the type `typeof SDLC_FRAMEWORK_PORT_VERSION`, which is imported type-only, so a port version change does not compile until the record changes too. A test pins the pair of plugin API version and port versions. Raising the plugin API to `0.2.0` makes the existing caret check reject `^0.1.0` plugins written for the draft port. The options considered were:
  - `1.0.0`, which would also freeze the manifest schema and the rest of the plugin API, a decision outside this item;
  - a per-port range in the manifest, which would change the item-8 manifest schema.

  Neither was needed.
- **Boundary rule.** Each import now records whether it is type-only: `import type`, `export type`, `import type x = require()`, or an `import()` type. `checkPluginSdkImport` rejects any import of a module package from `packages/plugin-sdk/src/` unless it is type-only and names `@taskelith/<module>/port`. A named type in a value import (`import { type X }`) does not count as type-only. The encapsulation rule accepts the port entry as the only workspace subpath.
- **Records.** ADR 0009 records the freeze. The main spec's Purpose drops the word "draft", because a delta cannot change a Purpose. The archived item-6 design stays as written; the new `Port entry` and `Frozen port types from the plugin SDK` requirements close its open question. Contract tooling section 9 gains the `archive` row that this item confirmed with the pinned CLI on a scratch copy of the fixtures.

## Risks / Trade-offs

- The normaliser's step reader works only for the pinned workflow layout; G4 replaces it with the adapter.
- `PLUGIN_API_VERSION` `0.2.0` rejects every plugin that declares `^0.1.0`. The only such plugin in the repository is the OpenSpec adapter, which this change updates.

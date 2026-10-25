## Context

The draft port (item 6) defines plain request and result shapes and a framework-neutral conformance suite that a plugin package's tests run with that package's fixtures. The boundary check lets a plugin's `src/` import only the kernel, plugin SDK, and contracts packages; its tests may import `@taskelith/sdlc`. Item 9 captured SpecKit 1.2.3's scaffold with the pinned CLI, but the feature artifacts it created are unfilled templates, because filling them is agent work.

## Goals / Non-Goals

Goals: feature, fix, and documentation fixtures for both frameworks, stored in each framework's plugin package; expected normalized outputs as conformance cases; checks that keep the fixtures true to their sources. Non-goals: any adapter or normaliser, the freeze, changes to the port or suite, and SpecKit agent runs.

## Decisions

- **Packages.** `@taskelith/sdlc-openspec` and `@taskelith/sdlc-speckit` follow the workspace package contract. Their `src/index.ts` exports nothing and compiles to an empty module, which the coverage scope check accepts; the adapter (item 11) and the normaliser (item 12) add source later. Fixtures live in `fixtures/` and expected outputs in `test/`, so nothing framework-specific enters the module or the suite. `@taskelith/kernel` and `@taskelith/sdlc` are development dependencies, used only by tests, and the tsconfig references them as the package contract requires.
- **Same work in both frameworks.** The OpenSpec fixtures are three archived changes of this repository, one per kind; the SpecKit features describe the same three pieces of work, so that item 12 compares the two designs on equal content.
- **OpenSpec sources.** Each change is copied byte for byte from the archive into an active change of the fixture working copy, with the living specs that the MODIFIED deltas need taken from the parent of each archive commit, so that the pinned CLI validates every change with `--strict`.
- **SpecKit sources.** The scaffold is copied byte for byte from the capture. The features are written by hand from the pinned templates, keep every mandatory section, and carry a comment that labels them as derived and names their template and source change. No `.specify/feature.json` is included: the scaffold's `.gitignore` excludes it, and the port names every work item explicitly.
- **Expected outputs as typed cases.** Each package's `test/*-mapping-cases.ts` builds `SdlcConformanceCase` values for a given working copy, so that TypeScript checks them against the port's types and an adapter test can run them on a copy. Digests are literal; long instruction texts are read from files: the pinned OpenSpec CLI's `instruction` fields, saved under `fixtures/expected/`, and SpecKit's agent command prompts in the working copy.
- **Normalization.** Each `fixtures/README.md` states the rules the expected outputs follow: identifier mapping, sorted discovery, the stage graph with platform-managed stages for missing native obligations, one revision per artifact file, instruction text sources, failure codes (`not-found` for an unknown work item or stage, `invalid` for a stage without agent instructions (platform-managed stages and OpenSpec's `archive`, which runs through finalization), `unavailable` for SpecKit's missing optional operations), and the evidence references. They are proposals for items 11 and 12, which may revise them before the freeze.
- **Checking the expected outputs.** Until an adapter exists, a replaying stand-in answers each request with its case's expected outcome, so that `runSdlcFrameworkConformance` checks the expected values themselves: runtime shapes, domain parsing, the capability declaration, and native-obligation coverage. The stand-in is a few lines in each package's test, duplicated rather than shared, because a shared helper would need a cross-package test import or a change to the module. Provenance tests check every literal digest, the archive copies, the schema and workflow digests, and, for OpenSpec, the pinned CLI's list, status, instruction, and strict-validation output with `OPENSPEC_TELEMETRY=0` and `DO_NOT_TRACK=1`.

## Risks / Trade-offs

- The SpecKit features are not agent output; item 12 or a later harness run may show that real output differs. The label and the README say so.
- Finalization pins the archive date, so the item-11 adapter test must fix the date and archive a copy of the working copy.
- No fixture has an invalid structure or a missing artifact; item 11 may add such cases when it implements validation.
- The OpenSpec CLI check spawns the pinned CLI about ten times, which adds about three seconds to the test run.

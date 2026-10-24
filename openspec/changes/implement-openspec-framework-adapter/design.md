## Context

The draft port (item 6) defines plain request and result shapes, and its conformance suite checks a plugin at run time. Item 8 added `registerPlugin`, which admits a plugin manifest for a port the host offers. Item 10 added the fixture working copy, the expected outputs as conformance cases, and the normalization rules in `packages/plugins/sdlc-openspec/fixtures/README.md`. [Contract tooling section 9](../../../docs/contract-tooling.md#9-openspec-json-output-for-the-adapter-d6) lists the confirmed `--json` outputs of the pinned CLI. The boundary check lets plugin source import only the kernel, plugin SDK, and contracts packages.

## Goals / Non-Goals

Goals: an adapter that passes every item-10 case through the real CLI, registration through the plugin SDK, and safe behavior around the working copy. Non-goals: the SpecKit normaliser, the port freeze and the port-type access question (item 12), and any change to the port, the suite, the fixtures, or the boundary rules.

## Decisions

- **CLI boundary.** `runOpenSpec` spawns the executable that the caller names (no shell) with `--json`, in the given directory, and returns the parsed output with whether the command succeeded, because `validate` reports an invalid change by failing. The telemetry variables are set after the caller's environment, so no option turns telemetry on. A spawn error is `unavailable`; output that is not JSON is `internal`.
- **Untrusted output.** `cli-output.ts` reads each command's JSON field by field and returns `internal` on an unexpected shape, so the adapter never acts on unchecked output.
- **Pinned version.** The first operation runs `version --json` once per instance; any version other than 1.14.3 makes every operation fail with `unavailable`, because the normalization is defined for that version. The checked version is the upstream tool version and appears in evidence references.
- **Working-copy root.** OpenSpec resolves the nearest root upwards. Every operation first runs `list` and requires the reported root to be the working copy's real path, so the adapter never reads or archives an enclosing project; otherwise it fails with `not-found`. A work item must be an active change in that list, else `not-found`.
- **Workflow.** The stage graph comes from `status --change` (the artifacts with their prerequisites and `applyRequires`): artifacts without prerequisites cover intake and the others specification; then `apply` (implementation), platform-managed `verify` and `review`, and native `archive` (closure). The workflow of a new change needs the graph of the project's default schema, which OpenSpec reports only for a change, so the adapter runs `status` for an empty change in a scratch directory holding a copy of the project's `openspec/config.yaml` (or `config.yml`) and `openspec/schemas/`, and removes it afterwards. The digest is the SHA-256 of `schema.yaml` in the directory that `schema which <name> --json` reports, and the version is that file's top-level `version` value.
- **Revisions.** One revision per file in the status `existingOutputPaths`, in schema order and sorted within an artifact, with the path relative to the working copy as the native reference.
- **Stage instructions.** Artifact stages use `instructions <artifact>` with the required artifacts' revisions as inputs; `apply` uses `instructions apply` with the revisions of its `contextFiles` and no output; `verify`, `review`, and `archive` fail with `invalid`; other stages with `not-found`.
- **Structural validation.** The subject must be exactly the current revision set, else `conflict`, so that the evidence describes what the caller holds. The report runs `validate <change> --type change --strict`; each issue becomes a problem as `<path>: <message>`.
- **Finalization.** `archive <change> --yes` in the working copy; a refused archive is `precondition-failed`. The revisions are the change's artifact files at the archive path that the CLI reports, digested after the move.
- **Registration.** `registerOpenSpecFramework(host, options)` admits `OPENSPEC_PLUGIN_MANIFEST` (`sdlc-openspec`, port `SdlcFramework`, plugin API `^0.1.0`) through `registerPlugin` and creates the framework only when admitted. The composition root supplies the CLI executable, so the plugin package does not depend on the CLI package.
- **Port shapes.** `sdlc-framework-shapes.ts` copies the port's plain shapes, as the item-6 design allows until item 12. The tests assign the adapter to `SdlcFramework` from `@taskelith/sdlc`, so a drift fails typechecking.
- **Tests.** The conformance test runs every item-10 case on a fresh copy of the fixture working copy, with finalization cases last so that archiving does not remove a change that a later case reads. A preloaded module (`NODE_OPTIONS=--import`) with `TZ=UTC` fixes the CLI clock to 2026-10-24, so the archive name is reproducible. Failure tests use stand-in executables for version, output-shape, and environment checks.

## Risks / Trade-offs

- Each operation spawns two to four CLI processes; the conformance test takes about 20 seconds. Caching would add state that the draft port does not need yet.
- The schema version is read with a single-line pattern rather than a YAML parser, to avoid a new dependency; a schema whose `version` is not a plain top-level scalar fails with `internal`.
- `archive --json` output was not covered by contract tooling section 9; the tests now confirm the `archive.path` field with the pinned CLI.

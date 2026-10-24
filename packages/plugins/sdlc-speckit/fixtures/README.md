# SpecKit mapping fixtures

Shared mapping fixtures for SpecKit 1.2.3 (G1 item 10), in a fixture-only stub package that G4 completes. A test-only normaliser, [`../test/speckit-normaliser.ts`](../test/speckit-normaliser.ts) (G1 item 12), applies the rules below to the working copy and passes every case. The expected normalized outputs are in [`../test/speckit-mapping-cases.ts`](../test/speckit-mapping-cases.ts) as cases of the framework-neutral conformance suite (`runSdlcFrameworkConformance` in `@taskelith/sdlc`).

## Provenance

`working-copy/` is a SpecKit project:

- Everything outside `specs/` is a byte-for-byte copy of the pinned scaffold capture, [`docs/qualification/speckit-1.2.3/scaffold/`](../../../../docs/qualification/speckit-1.2.3/scaffold/), made by `make speckit-capture` ([capture record](../../../../docs/qualification/speckit.md)).
- `specs/` holds three features, each with `spec.md`, `plan.md`, and `tasks.md`. They are **derived**: written by hand from the pinned templates in `.specify/templates/`, with content taken from the same three archived OpenSpec changes as the OpenSpec fixtures, so that both frameworks describe the same work. No harness has run SpecKit's agent steps (`specify`, `plan`, `tasks`), so real agent output may differ. Each file carries a comment that says so, after the front matter in `tasks.md`.

| Kind | Feature | Content from |
| --- | --- | --- |
| Feature | `001-sdlc-framework-port` | `openspec/changes/archive/2026-10-24-draft-sdlc-framework-port` |
| Fix | `002-boundary-entrypoint-fix` | `openspec/changes/archive/2026-10-24-fix-boundary-entrypoint` |
| Documentation | `003-worktree-pitfalls-docs` | `openspec/changes/archive/2026-10-24-document-worktree-pitfalls` |

The working copy has no `.specify/feature.json`: the scaffold's `.specify/.gitignore` ignores it, and every request names its feature explicitly. The tests check that the scaffold still equals the capture, that the expected digests are the digests of the fixture files and of the bundled workflow, and that each derived file carries its label.

## Normalization rules

- **Work items.** The platform identifier is `speckit:<feature directory>`, and the native reference is the feature directory name. Discovery lists the features under `specs/` sorted by directory name.
- **Workflow.** The bundled `speckit` workflow, version 1.0.1, as the stage graph `specify` → `review-spec` → `plan` → `review-plan` → `tasks` → `implement` → `verify` → `review` → `close`. The workflow's two gates are platform-managed review stages, because they cannot be decided headlessly and a framework gate is a platform gate requiring semantic approval; `verify`, `review` (of the implementation), and `close` are platform-managed, because SpecKit has no native verification record, implementation review, or closure. The digest is the SHA-256 of `.specify/workflows/speckit/workflow.yml`; the upstream tool version is the `specify-cli` version.
- **Capabilities.** No optional operation: there is no structural validator for feature artifacts and no closure operation, so `validateStructure` and `finalize` fail with `unavailable`. The native obligations are intake, specification, and implementation.
- **Artifacts.** `spec` from `specify`, `plan` from `plan` (requires `spec`), and `tasks` from `tasks` (requires `spec` and `plan`), all present. The other `plan` outputs (`research.md`, `data-model.md`, `quickstart.md`, `contracts/`) are not in these fixtures.
- **Revisions.** One revision per artifact file, with the path relative to the working copy as the native reference.
- **Stage instructions.** The instruction text is the native stage's agent command prompt in `.agent/commands/` (`speckit.<stage>.md`), verbatim. For `specify`, `plan`, and `tasks`, the inputs are the revisions of the artifacts the stage requires, and the output is the stage's artifact; for `implement`, the inputs are the revisions of `spec`, `plan`, and `tasks`, and there is no output artifact. A platform-managed stage has no native instructions and fails with `invalid`; an unknown stage or feature fails with `not-found`.

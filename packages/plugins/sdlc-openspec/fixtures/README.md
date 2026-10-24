# OpenSpec mapping fixtures

Shared mapping fixtures for OpenSpec 1.14.3 (G1 item 10). The expected normalized outputs are in [`../test/openspec-mapping-cases.ts`](../test/openspec-mapping-cases.ts) as cases of the framework-neutral conformance suite (`runSdlcFrameworkConformance` in `@taskelith/sdlc`). The adapter in [`../src/`](../src/) (G1 item 11) passes them in [`../test/openspec-framework.test.ts`](../test/openspec-framework.test.ts), on a copy of the working copy with the CLI clock pinned to the archive date.

## Provenance

`working-copy/` is an OpenSpec project with three active changes, each a byte-for-byte copy of a change in this repository's `openspec/changes/archive/` before it was archived:

| Kind | Change | Archived as |
| --- | --- | --- |
| Feature | `draft-sdlc-framework-port` | `2026-10-24-draft-sdlc-framework-port` (archive commit `d2f5326`) |
| Fix | `fix-boundary-entrypoint` | `2026-10-24-fix-boundary-entrypoint` (archive commit `0729388`) |
| Documentation | `document-worktree-pitfalls` | `2026-10-24-document-worktree-pitfalls` (archive commit `4f78d29`) |

- `openspec/config.yaml` is this repository's configuration.
- `openspec/specs/trust-and-operational-foundation/spec.md` and `openspec/specs/integration-flow/spec.md` are the living specs that the fix and documentation deltas modify, as they were in the parent of each archive commit (`0729388^` and `4f78d29^`). The feature change adds a new capability and needs no base spec.
- `expected/instructions/<stage>.md` is the `instruction` field of `openspec instructions <stage> --change <change> --json`, run with the pinned CLI in `working-copy/`.

The tests check that the working copy holds exactly these files, that the changes still equal the archive and the configuration equals this repository's, that the expected digests are the digests of the fixture files, the base specs, and the installed `spec-driven` schema, and that the pinned CLI lists the three changes, reports the expected artifacts, returns the expected instruction texts, and validates the changes and base specs with `validate --all --strict`.

## Normalization rules

- **Work items.** The platform identifier is `openspec:<change>`, and the native reference is the change name. Discovery lists active changes sorted by change name, because the CLI lists them by modification time.
- **Workflow.** The `spec-driven` schema, version 1, as the stage graph `proposal` → `specs` and `design` → `tasks` → `apply` → `verify` → `review` → `archive`. `verify` and `review` are platform-managed, because OpenSpec has no native verification or review; the other stages are native. The digest is the SHA-256 of the installed `schemas/spec-driven/schema.yaml`; the upstream tool version is the CLI version.
- **Artifacts.** The four schema artifacts with their schema prerequisites, each produced by the stage of the same name; `present` is the CLI status `done`.
- **Revisions.** One revision per artifact file, in schema order. A `specs` artifact has one revision per delta spec file. The native reference is the file path relative to the working copy; files outside the schema, such as `verification.md`, are not artifacts.
- **Stage instructions.** For an artifact stage, the instruction text is the CLI `instruction` field of `instructions <artifact>`, the inputs are the revisions of the artifacts the stage requires, and the output is the stage's artifact. For `apply`, the instruction text is the `instruction` field of `instructions apply`, which depends on task progress (the fixtures have every task done), the inputs are the revisions of the CLI's `contextFiles` (all four artifacts), and there is no output artifact. `archive` is not an agent task: it runs through finalization, and the CLI's archive instructions have no `instruction` field. `verify`, `review`, and `archive` therefore fail with `invalid`; an unknown stage or change fails with `not-found`.
- **Structural validation.** The validator is `openspec-validate-strict`, and the evidence reference is the pinned command, `openspec@1.14.3 validate <change> --strict`.
- **Finalization.** Archiving reports the archived artifact revisions under `openspec/changes/archive/<date>-<change>/` with unchanged digests, and the reference `openspec@1.14.3 archive <change> --yes`. The date is pinned to 2026-10-24, so an adapter test must fix the archive date and run on a copy of the working copy.

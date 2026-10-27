# Verification: implement-openspec-framework-adapter

Date: 2026-10-24. Author verification and independent review are recorded below.

## Scope and source

G1 item 11 of the [G1 work plan](/docs/g1-plan.md), assigned by the coordinating session (Niki); items 6, 8, and 10 are merged. Base revision: `021854a` on `dev`. Scope: the adapter in `packages/plugins/sdlc-openspec/src/` (`openspec-cli.ts`, `cli-output.ts`, `openspec-framework.ts`, `openspec-plugin.ts`, `sdlc-framework-shapes.ts`, `index.ts`), its tests (`test/openspec-framework.test.ts`, `test/fixed-archive-date.mjs`), a comment in `test/openspec-mapping-fixtures.test.ts` and a sentence in `fixtures/README.md` that described the adapter as missing, the package's manifest and tsconfig (runtime dependencies on `@taskelith/kernel` and `@taskelith/plugin-sdk`, Node types), the workspace entries in `package-lock.json`, the regenerated `docs/dependencies/licenses.json` and `docs/dependencies/sbom.cdx.json`, and this change. Prepared in its own git worktree from a fresh `origin/dev`.

## Evidence

- CLI output, with the pinned `@fission-ai/openspec` 1.14.3 and `OPENSPEC_TELEMETRY=0` in copies of the fixture working copy: `list`, `status --change`, `instructions <artifact>` and `instructions apply`, `validate <change> --type change --strict`, `schema which <name>`, and `version` printed the fields the adapter reads. `status --change` for an empty change directory in a scratch project with a copy of `openspec/config.yaml` reported the `spec-driven` graph with `applyRequires: ["tasks"]`.
- `archive <change> --yes --json`, not verified by [contract tooling section 9](/docs/contract-tooling.md#9-openspec-json-output-for-the-adapter-d6): success printed `{ archive: { change, archivedAs, path, specsUpdated, totals }, root }` with exit 0; with the target directory already present, it printed `archive: null` and a `status` entry `archive_target_exists` with exit 1.
- Archive date: the CLI names the archive with its local date (`formatLocalDate()`). Run with the test preload changed to 2020-01-02, the CLI archived a copy as `2020-01-02-fix-boundary-entrypoint`, so the pin takes effect. `git status` showed no change to the fixture working copy after the tests.
- `list` in a directory outside any OpenSpec project exits 1 with a `no_openspec_root` status (reported by the reviewer in pass 1, now tested).

## Author self-check before review

- Against ADR 0004: plugin source imports only `@taskelith/kernel`, `@taskelith/plugin-sdk`, and Node built-ins, and the boundary check passes; the port is satisfied structurally and the tests assign the adapter to `SdlcFramework` from `@taskelith/sdlc`; the CLI boundary, output readers, framework, and registration are separate modules; coverage stays above 75% for lines, branches, and functions; principles 5 (Docker), 6 (OpenAPI), and 7 (Makefile) add no obligation for a plugin without an interface or image, and `make verify` runs the new tests.
- Scope: no change to the port, the suite, the expected outputs, or the boundary rules; no SpecKit work; no UI.
- Comments: every comment line the change adds is at most 80 characters and every comment at most two lines, checked with a script over the diff.
- Honest status: the conformance and finalization tests archive only copies in a temporary directory; nothing claims deployment or orchestration.
- Evidence check: the change adds only repository-relative links and no external source; every CLI output it relies on was observed with the pinned CLI as recorded above.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1, Docker running, after `npm install --ignore-scripts` updated the workspace entries:

- The first `make verify` failed `verify:dependencies` with "Dependency evidence drift: docs/dependencies/licenses.json"; `npm run inventory:dependencies` regenerated the evidence (the lockfile digest and the new `@taskelith/plugin-sdk` edge of `@taskelith/sdlc-openspec`).
- `make verify` passed at `2fe772f`: 242 tests passed, 0 failed; coverage 99.94% lines, 95.99% branches, 100% functions; boundary and coverage scope checks passed; no undeclared contract breaking change; dependency inventory verified (681 package paths); strict OpenSpec validation 33 passed; package verification passed.
- After the pass-1 fixes: `make verify` passed: 246 tests passed, 0 failed; coverage 99.62% lines, 95.74% branches, 99.63% functions; boundary and coverage scope checks passed; no undeclared contract breaking change; dependency inventory verified (681 package paths); strict OpenSpec validation 33 passed; package verification passed.
- `npm run openspec -- validate implement-openspec-framework-adapter --strict`: valid.

## Independent review

Assigned reviewer: Claude Code, `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, run from the worktree, with the prompt, output, and snapshot files in a scratch directory outside it. The prompt named AGENTS.md (including the comment rule), ADR 0004, the governance review process, the agent task protocol, architecture section 6, the plugin boundary rules, the touched specs, and this change's artifacts as criteria, and asked for every instance of each problem with severity, file, line, and fix.

- **Pass 1** (session `21f1861c-8b50-49bd-8bc8-0a2f59eef520`; `modelUsage` named only `claude-fable-5-1`), reviewing `021854a..2fe772f`. Snapshot before and after: `e9683672818e910e4fbfaa3de8b9e5faa7413941cddd34639e2ddb6dce165ab8`, equal. The reviewer ran the adapter tests against the existing build (14 passed) and checked the CLI in an empty directory. Findings: 0 Critical, 0 High, 3 Medium, 9 Low. All accepted and resolved:
  1. Medium: a directory outside any OpenSpec project made `list` fail, which became `internal`, not the specified `not-found`. `list` failure is now `not-found`, and a test covers an empty directory.
  2. Medium: absolute paths from the CLI output were read without checking that they lie in the working copy. Revisions are read only inside the working copy and finalization only inside the change directory, else `internal`; a test uses a stand-in CLI that lists `/etc/hosts` (the finalization test came with the pass-2 fixes).
  3. Medium: a file-system error in the new-change probe would throw instead of returning a `Result`. The probe is wrapped and reports `internal`.
  4. Low: a failed version check stayed cached for the instance. Only a successful check is kept.
  5. Low: the CLI's standard error was lost when its output was not JSON. Its start is in the failure details.
  6. Low: the schema `version` pattern rejected a quoted value or a trailing comment. Both are accepted.
  7. Low: nothing tied the manifest capabilities to the declared optional operations. The manifest derives them in kebab case, and a test checks the result.
  8. Low: the preloaded `Date` replacement was a class, which throws when called without `new`. It is now a proxy whose call returns the fixed date's string.
  9. Low: the `NODE_OPTIONS` import path was unquoted. It is quoted.
  10. Low: `archive --json` stays unverified in contract tooling section 9 although the tests confirm it. This record's Evidence section documents the confirmed shapes; section 9 is outside this task's scope.
  11. Low: an unnamed intersection type. Named `WorkflowSubject`.
  12. Low: a working copy that is a file gave `unavailable`. A working copy must be a directory, else `not-found`; a test covers it.

- **Pass 2** (session `40bb1e5a-11da-4199-9259-d257220fb5f0`; `modelUsage` named only `claude-fable-5-1`), reviewing `021854a..17384db` and confirming each pass-1 resolution against `2fe772f..17384db`. Snapshot before and after: `cb129f24d03e75222a706a473859a11d461c3f246446c61f76e5676693c06c7a`, equal. The reviewer confirmed all twelve pass-1 findings resolved. Findings: 0 Critical, 0 High, 0 Medium, 7 Low. All accepted and fixed without another pass, as the review process allows for a Low-only pass, so these fixes are unreviewed:
  1. Low: `isDirectory` could throw if `stat` failed after `realpath`. A failed `stat` now means not a directory, so `not-found`.
  2. Low: the finalization guard against a file outside the change directory had no test. A stand-in CLI lists such a file; finalization fails with `internal` and the stand-in's archive command never runs.
  3. Low: the CLI had no timeout. It has 120 seconds, after which the operation is `unavailable`.
  4. Low: an exceeded output limit or a signal was reported as `unavailable` although the CLI had started. Both are `internal`; only a CLI that cannot start or times out is `unavailable`.
  5. Low: a synchronous `existsSync` in the asynchronous probe. Replaced with `access` from `node:fs/promises`.
  6. Low: the design and this record gave different test durations. Both say 20 to 25 seconds.
  7. Low: the author self-check had no evidence check. Added.

## Limitations

- The adapter supports only what the pinned CLI reports; other CLI versions are refused.
- The conformance test takes 20 to 25 seconds, because each operation spawns the CLI two to four times.
- Plugin source keeps a structural copy of the port shapes until item 12 resolves plugin access to the port type.

## Remaining gates

- Integration into `dev` by the coordinating session, then archiving the change.

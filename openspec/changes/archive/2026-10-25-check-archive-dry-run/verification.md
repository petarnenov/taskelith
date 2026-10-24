# Verification: check-archive-dry-run

## Scope and source

Assigned by the coordinator on 2026-10-25 under the agent task protocol, after three archives failed strict validation after merge although `openspec validate <change> --strict` had passed: two changes created capabilities without a `## Purpose`, and one requirement grew past 500 characters once applied. Base revision: `36ea29f` on `dev`. Scope: `scripts/check-archive-dry-run.ts`, `test/check-archive-dry-run.test.ts`, `package.json` (`verify:archive`) with its provenance hash in `docs/dependencies/licenses.json`, `Makefile`, `docs/agent-task-protocol.md`, and this change.

## Author self-check

- The check copies `openspec/` into a `mkdtemp` directory, following symbolic links, runs the pinned CLI there, and removes the copy in a `finally` block; it reads the repository and writes only the copy. SIGINT and SIGTERM abort the CLI and reach the same `finally` block; SIGKILL cannot be handled.
- A failed archive leaves the copy unchanged ("Aborted. No files were changed."), so the remaining changes still archive and every problem is reported in one run.
- Telemetry and the update check are off through `OPENSPEC_TELEMETRY=0`, `DO_NOT_TRACK=1`, and `OPENSPEC_NO_UPDATE_CHECK=1`; the CLI needs no network or git for `archive` and `validate`.
- Evidence check: the environment variables come from the pinned `@fission-ai/openspec` 1.14.3 sources (`dist/telemetry/index.d.ts` and `dist/core/version-check.js`); the JSON report shape (`items[].id`, `type`, `valid`, `issues[].level`, `path`, `message`) and the nonzero exit with a JSON report on failure were observed with that version. No external page is linked.
- Each changed requirement is under 500 characters (463 and 437), and the check archived this change itself during `make verify`.
- Every comment the change adds is at most two lines of at most 80 characters.

## Checks

macOS, Node.js v24.22.1, npm 12.2.1, Docker running.

- `node --experimental-strip-types --test test/check-archive-dry-run.test.ts`: 13 tests, 0 failed, three runs in a row after the pass-2 fixes (8 after pass 1). Six unit tests cover the pure parts. Three test the command runner with Node.js child processes: output and failure, an interruption that settles only after the child has run its SIGTERM handler and exited, and an interruption before the start. Four run the script on a fixture project with its own `TMPDIR`: a capability without a Purpose fails and leaves no copy, a nested capability is named after its change, a linked `openspec/specs` stays empty, and SIGTERM after the copy exists exits 143 and leaves no copy.
- Node.js v24.22.1 `cpSync` with `recursive` and `dereference` kept a nested symbolic link as a link in a scratch reproduction, which is why the script copies by hand.
- Reproductions in a scratch directory outside the worktree, with a copy of `openspec/`, running the worktree's script (before pass 1 through a symlink to the worktree's `node_modules`; the second case was repeated after the pass-1 fixes without it, with the same result):

  | Case | Result |
  | --- | --- |
  | `add-demo` creates `demo-cap` without a Purpose; `grow-flow` modifies a missing requirement | exit 1; `grow-flow: openspec archive failed: ...` with the CLI's "not found" message, and `add-demo: spec demo-cap: [WARNING] overview: Purpose section is still a placeholder ...` |
  | `add-demo` as above; `grow-flow` makes "Parallel development in worktrees" longer than 500 characters, its delta valid under `validate grow-flow --strict` | exit 1; the Purpose issue for `add-demo` and `check-archive-dry-run, grow-flow: spec integration-flow: [WARNING] requirements[4]: Requirement text is very long (>500 characters) ...` |
  | the worktree with only this change active | exit 0 |

  After each run the SHA-256 digest of every file under the scratch `openspec/` was unchanged, and no `taskelith-archive-dry-run-*` directory was left in `$TMPDIR`.
- The no-active-change case ran in the worktree on `36ea29f` with the script added but before the change directory was created: "No active OpenSpec change; nothing to archive.", exit 0.
- `make verify` passed before pass 1 (233 tests, 0 failed), after the pass-1 fixes (236 tests), and after the pass-2 fixes (241 tests), each time with coverage thresholds met, no undeclared contract change, 33 strict OpenSpec validations, the archive dry run, and package verification.

## Independent review

Assigned reviewer: Codex CLI (Codex Sol, medium), by rotation; Antigravity CLI is unavailable until 2026-10-31. Invoked as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>` from the task worktree, with prompt, log, and snapshot files in a scratch directory outside the worktree.

- **Pass 1 — session `01a16fbc-dff1-7702-af34-0c8a2bd4733e`, on `ad3adba`.** The output header reported model `gpt-6.1-sol`, reasoning effort `medium`, and sandbox `read-only`. SHA-256 snapshots before and after were equal. The reviewer ran the unit tests (5 passed) and confirmed the requirement lengths and the comment rule. Findings: 0 Critical, 1 High, 1 Medium, 1 Low, all fixed, for the next pass to check:
  1. High: `cpSync` keeps symbolic links, so an archive in the copy could write through a linked `openspec/specs` into the repository. The script now copies by hand and follows links, since `cpSync`'s `dereference` keeps nested links; a fixture test with a linked `specs` directory covers it.
  2. Medium: SIGINT or SIGTERM ended Node.js without running the `finally` block, leaving the copy. The CLI now runs asynchronously under an `AbortController`; the signals abort it, the copy is removed, and the check exits with 128 plus the signal number. A fixture test covers SIGTERM; the design and the delta state that SIGKILL is outside the guarantee.
  3. Low: task 2.1 was open although this record reported its checks. It is now checked.

- **Pass 2 — session `01a16fc1-bcf6-79f1-8b52-b2d5d60008a0`, on `840e365`.** Same invocation; the output header reported model `gpt-6.1-sol`, reasoning effort `medium`, and sandbox `read-only`. SHA-256 snapshots before and after were equal. The reviewer confirmed the resolution of pass-1 findings 1 and 3 and found finding 2 partly resolved (new finding 1). It ran the unit tests (5 passed); its sandbox refused `mkdtemp` (`EPERM`), so the fixture tests did not run there. New findings: 0 Critical, 0 High, 2 Medium, 2 Low, all fixed, for the next pass to check:
  1. Medium: on abort, promisified `execFile` rejects before the child closes, so the copy could be removed while the CLI still wrote to it. A new `runCommand` spawns the CLI, sends SIGTERM on abort, and settles only on `close`; a test proves that the interrupted command settles after its child's SIGTERM handler has run.
  2. Medium: only top-level directories under a change's `specs/` were taken as capabilities, so a nested capability such as `area/demo` was reported as `no active change`. `capabilityIds` now takes the directory of every `spec.md`, recursively, with `/` separators; a unit test and a fixture test cover it.
  3. Low: the signal test's polling interval was never cleared if the child exited before creating the copy, and the test had no time limit. The interval is now cleared on `close`, and the signal and interruption tests have time limits.
  4. Low: the requirement said the copy is removed in every case, while the design excludes SIGKILL. The requirement now says "unless the check is killed with SIGKILL".

- **Pass 3 — session `01a16fc6-1ae6-71c2-a723-439d3286d06d`, on `61c3dfe`.** Same invocation; the output header reported model `gpt-6.1-sol`, reasoning effort `medium`, and sandbox `read-only`. SHA-256 snapshots before and after were equal. The reviewer confirmed the resolution of pass-2 findings 1, 2, and 4 and found finding 3 partly resolved; its sandbox again refused the fixture tests (8 passed, 5 blocked by `EPERM`). New findings: 0 Critical, 0 High, 0 Medium, 1 Low:
  1. Low: the new `waitFor` helper of the interruption test could keep the test process alive if the child never became ready, because its interval was never cleared; the test's time limit cancels the test but not the interval. Fixed without another pass, as the review process allows for a Low-only pass (see below).

## Unreviewed fixes after the third pass

- `waitFor` now takes an `AbortSignal` and clears its interval on success and on abort; the interruption test passes it the test's signal combined with a 10-second timeout, and aborts the command in its cleanup, which terminates the child. `node --experimental-strip-types --test test/check-archive-dry-run.test.ts` passed three runs in a row (13 tests, 0 failed), and `make verify` passed again (241 tests, 0 failed, with the other results as above).

## Conflict resolution and fourth pass

At integration the coordinator returned the task under worker step 9: `dev` (`61d180b`) had merged the OpenSpec framework adapter (#85, #86), which changed workspace dependencies and regenerated `docs/dependencies/licenses.json` and the SBOM, so merging it conflicted in `licenses.json`.

- `origin/dev` was merged into the branch with a merge commit (`1192f24`, first parent `f0de1be`). The conflict was resolved by taking `dev`'s `licenses.json`, then `npm ci --ignore-scripts` and `npm run inventory:dependencies`, with no hand edit. The only difference of `docs/dependencies/` from `dev` is the `package.json` provenance hash, because the branch adds `verify:archive`.
- `make verify` on the tree of `1192f24` (staged and run right before the merge commit, nothing changed after), macOS, Node.js v24.22.1, npm 12.2.1, Docker running: passed with 260 tests, 0 failed, coverage thresholds met, no undeclared contract change, 34 strict OpenSpec validations, the archive dry run with this change as the only active one, and package verification.
- The owner explicitly authorized a fourth review pass on the merge commit on 2026-10-25.
- **Pass 4 — Codex session `01a16fcb-027a-74f1-afe3-bd538c46d6ab`, on `1192f24` only.** Same invocation; the output header reported model `gpt-6.1-sol`, reasoning effort `medium`, and sandbox `read-only`. SHA-256 snapshots before and after were equal. The reviewer found `licenses.json` byte-identical to the generator's output for the merged inputs, no change lost in the merge, and no incompatibility with the new `openspec-framework-adapter` spec or the `sdlc-openspec` plugin. Findings: 0 Critical, 0 High, 1 Medium, 0 Low:
  1. Medium: this record had no verification evidence for the merge tree, which evidence freshness requires. The `make verify` run above is now recorded.
- The owner decided on 2026-10-25 to accept this documentation-only fix without a fifth pass; it is unreviewed.

## Limitations

- SIGINT is handled by the same code path as SIGTERM but has no test of its own.
- SIGKILL can leave a `taskelith-archive-dry-run-*` directory in the system temporary directory.

## Remaining gates

Handoff to the coordinator, integration into `dev`, and archiving.

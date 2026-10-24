# Verification: check-archive-dry-run

## Scope and source

Assigned by the coordinator on 2026-10-25 under the agent task protocol, after three archives failed strict validation after merge although `openspec validate <change> --strict` had passed: two changes created capabilities without a `## Purpose`, and one requirement grew past 500 characters once applied. Base revision: `36ea29f` on `dev`. Scope: `scripts/check-archive-dry-run.ts`, `test/check-archive-dry-run.test.ts`, `package.json` (`verify:archive`) with its provenance hash in `docs/dependencies/licenses.json`, `Makefile`, `docs/agent-task-protocol.md`, and this change.

## Author self-check

- The check copies `openspec/` into a `mkdtemp` directory, following symbolic links, runs the pinned CLI there, and removes the copy in a `finally` block; it reads the repository and writes only the copy. SIGINT and SIGTERM abort the CLI and reach the same `finally` block; SIGKILL cannot be handled.
- A failed archive leaves the copy unchanged ("Aborted. No files were changed."), so the remaining changes still archive and every problem is reported in one run.
- Telemetry and the update check are off through `OPENSPEC_TELEMETRY=0`, `DO_NOT_TRACK=1`, and `OPENSPEC_NO_UPDATE_CHECK=1`; the CLI needs no network or git for `archive` and `validate`.
- Evidence check: the environment variables come from the pinned `@fission-ai/openspec` 1.14.3 sources (`dist/telemetry/index.d.ts` and `dist/core/version-check.js`); the JSON report shape (`items[].id`, `type`, `valid`, `issues[].level`, `path`, `message`) and the nonzero exit with a JSON report on failure were observed with that version. No external page is linked.
- Each changed requirement is under 500 characters (463 and 411), and the check archived this change itself during `make verify`.
- Every comment the change adds is at most two lines of at most 80 characters.

## Checks

macOS, Node.js v24.22.1, npm 12.2.1, Docker running.

- `node --experimental-strip-types --test test/check-archive-dry-run.test.ts`: 8 tests, 0 failed, three runs in a row. Five unit tests cover the pure parts; three run the script on a fixture project with its own `TMPDIR`: a capability without a Purpose fails and leaves no copy, a linked `openspec/specs` stays empty, and SIGTERM after the copy exists exits 143 and leaves no copy.
- Node.js v24.22.1 `cpSync` with `recursive` and `dereference` kept a nested symbolic link as a link in a scratch reproduction, which is why the script copies by hand.
- Reproductions in a scratch directory outside the worktree, with a copy of `openspec/`, running the worktree's script (before pass 1 through a symlink to the worktree's `node_modules`; the second case was repeated after the pass-1 fixes without it, with the same result):

  | Case | Result |
  | --- | --- |
  | `add-demo` creates `demo-cap` without a Purpose; `grow-flow` modifies a missing requirement | exit 1; `grow-flow: openspec archive failed: ...` with the CLI's "not found" message, and `add-demo: spec demo-cap: [WARNING] overview: Purpose section is still a placeholder ...` |
  | `add-demo` as above; `grow-flow` makes "Parallel development in worktrees" longer than 500 characters, its delta valid under `validate grow-flow --strict` | exit 1; the Purpose issue for `add-demo` and `check-archive-dry-run, grow-flow: spec integration-flow: [WARNING] requirements[4]: Requirement text is very long (>500 characters) ...` |
  | the worktree with only this change active | exit 0 |

  After each run the SHA-256 digest of every file under the scratch `openspec/` was unchanged, and no `taskelith-archive-dry-run-*` directory was left in `$TMPDIR`.
- The no-active-change case ran in the worktree on `36ea29f` with the script added but before the change directory was created: "No active OpenSpec change; nothing to archive.", exit 0.
- `make verify` passed before pass 1 (233 tests, 0 failed) and after the pass-1 fixes (236 tests, 0 failed), each time with coverage thresholds met, no undeclared contract change, 33 strict OpenSpec validations, the archive dry run, and package verification.

## Independent review

Assigned reviewer: Codex CLI (Codex Sol, medium), by rotation; Antigravity CLI is unavailable until 2026-10-31. Invoked as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>` from the task worktree, with prompt, log, and snapshot files in a scratch directory outside the worktree.

- **Pass 1 — session `01a16fbc-dff1-7702-af34-0c8a2bd4733e`, on `ad3adba`.** The output header reported model `gpt-6.1-sol`, reasoning effort `medium`, and sandbox `read-only`. SHA-256 snapshots before and after were equal. The reviewer ran the unit tests (5 passed) and confirmed the requirement lengths and the comment rule. Findings: 0 Critical, 1 High, 1 Medium, 1 Low, all fixed, for the next pass to check:
  1. High: `cpSync` keeps symbolic links, so an archive in the copy could write through a linked `openspec/specs` into the repository. The script now copies by hand and follows links, since `cpSync`'s `dereference` keeps nested links; a fixture test with a linked `specs` directory covers it.
  2. Medium: SIGINT or SIGTERM ended Node.js without running the `finally` block, leaving the copy. The CLI now runs asynchronously under an `AbortController`; the signals abort it, the copy is removed, and the check exits with 128 plus the signal number. A fixture test covers SIGTERM; the design and the delta state that SIGKILL is outside the guarantee.
  3. Low: task 2.1 was open although this record reported its checks. It is now checked.

## Limitations

- SIGINT is handled by the same code path as SIGTERM but has no test of its own.
- SIGKILL can leave a `taskelith-archive-dry-run-*` directory in the system temporary directory.

## Remaining gates

Independent review, handoff to the coordinator, integration into `dev`, and archiving.

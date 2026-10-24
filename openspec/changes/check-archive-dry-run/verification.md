# Verification: check-archive-dry-run

## Scope and source

Assigned by the coordinator on 2026-10-25 under the agent task protocol, after three archives failed strict validation after merge although `openspec validate <change> --strict` had passed: two changes created capabilities without a `## Purpose`, and one requirement grew past 500 characters once applied. Base revision: `36ea29f` on `dev`. Scope: `scripts/check-archive-dry-run.ts`, `test/check-archive-dry-run.test.ts`, `package.json` (`verify:archive`) with its provenance hash in `docs/dependencies/licenses.json`, `Makefile`, `docs/agent-task-protocol.md`, and this change.

## Author self-check

- The check copies `openspec/` into a `mkdtemp` directory, runs the pinned CLI there, and removes the copy in a `finally` block; it reads the repository and writes only the copy.
- A failed archive leaves the copy unchanged ("Aborted. No files were changed."), so the remaining changes still archive and every problem is reported in one run.
- Telemetry and the update check are off through `OPENSPEC_TELEMETRY=0`, `DO_NOT_TRACK=1`, and `OPENSPEC_NO_UPDATE_CHECK=1`; the CLI needs no network or git for `archive` and `validate`.
- Evidence check: the environment variables come from the pinned `@fission-ai/openspec` 1.14.3 sources (`dist/telemetry/index.d.ts` and `dist/core/version-check.js`); the JSON report shape (`items[].id`, `type`, `valid`, `issues[].level`, `path`, `message`) and the nonzero exit with a JSON report on failure were observed with that version. No external page is linked.
- Each changed requirement is under 500 characters (463 and 411), and the check archived this change itself during `make verify`.
- Every comment the change adds is at most two lines of at most 80 characters.

## Checks

macOS, Node.js v24.22.1, npm 12.2.1, Docker running.

- `node --experimental-strip-types --test test/check-archive-dry-run.test.ts`: 5 tests, 0 failed.
- Reproductions in a scratch directory outside the worktree, with a copy of `openspec/` and a symlink to the worktree's `node_modules`, running the worktree's script:

  | Case | Result |
  | --- | --- |
  | `add-demo` creates `demo-cap` without a Purpose; `grow-flow` modifies a missing requirement | exit 1; `grow-flow: openspec archive failed: ...` with the CLI's "not found" message, and `add-demo: spec demo-cap: [WARNING] overview: Purpose section is still a placeholder ...` |
  | `add-demo` as above; `grow-flow` makes "Parallel development in worktrees" longer than 500 characters, its delta valid under `validate grow-flow --strict` | exit 1; the Purpose issue for `add-demo` and `check-archive-dry-run, grow-flow: spec integration-flow: [WARNING] requirements[4]: Requirement text is very long (>500 characters) ...` |
  | the worktree with only this change active | exit 0 |

  After each run the SHA-256 digest of every file under the scratch `openspec/` was unchanged, and no `taskelith-archive-dry-run-*` directory was left in `$TMPDIR`.
- The no-active-change case ran on `dev` (`36ea29f`) before this change existed: "No active OpenSpec change; nothing to archive.", exit 0.
- `make verify` passed: 233 tests, 0 failed, coverage thresholds met, no undeclared contract change, 33 strict OpenSpec validations, the archive dry run, and package verification.

## Independent review

Assigned reviewer: Codex CLI (Codex Sol, medium), by rotation; Antigravity CLI is unavailable until 2026-10-31.

## Limitations

- The unit tests cover the pure parts; the copy, archive, and validation steps are covered by the reproductions above.

## Remaining gates

Independent review, handoff to the coordinator, integration into `dev`, and archiving.

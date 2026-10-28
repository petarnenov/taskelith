# Verification

Date: 2026-10-28. The author's verification, `make verify`, and review passes 1 to 3 are recorded below.

## Scope and source

Worker Pepi's brief of 2026-10-28 for the change `fix-make-argument-expansion` (size S, commit type `chore`), a regression of pull request #383 under GNU Make 4.4 reported by worker Liki (GNU Make 4.4.1 on Ubuntu). The worktree work was done in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/fix-make-argument-expansion` on branch `fix-make-argument-expansion`.

- **Base revision:** `f3a53f17` (`origin/dev`, merge of pull request #383).
- **Scope:** `Makefile` (the `unexport` line and its comment); `test/gnu-makes.ts` (new), `test/verification-record.test.ts`, and `test/integrate-script.test.ts`; the `agent-task-protocol` spec delta.
- **Out of scope:** the other targets that take command-line variables, which `design.md` ("Other free-form arguments") lists; their expansion predates pull request #383.

## Author self-check

- **Root cause found, not assumed.** Minimal Makefiles under GNU Make 4.4.1 show that the expansion comes from the parse-time `$(shell)` calls at lines 2, 3, and 7 of the `Makefile` of `f3a53f17`, which run before its `unexport` line at line 277; the `export X := $(value VAR)` copies pass the value intact once the variable is unexported ([design](design.md), "Root cause").
- **Brief's diagnosis corrected.** The brief named the `export X := $(value VAR)` pattern as the cause; it is not, as the root cause above and [design](design.md) show.
- **Interface unchanged.** The three targets keep their invocations; only the position of `unexport` and its comment change in the `Makefile`.
- **Requirement length.** "Shared integration command" 489 and "Generated verification record" 490 characters, under the 500 of the pinned OpenSpec; `npm run verify:archive`, inside `make verify`, archives the change in a temporary copy into strictly valid specs.
- **Tests.** The two tests loop over the GNU makes on `PATH` and fail on an empty list; they wait on no timer and share no state with other tests.
- New comments are at most two lines of at most 80 characters; `npm run verify:comments` passes.
- Commit types are `chore`, `test`, and `docs`, without attribution.

## Evidence check

Hosts: macOS on Intel, `/usr/bin/make` GNU Make 3.81, `/usr/local/bin/gmake` GNU Make 4.4.1 (Homebrew), Node.js 24.22.1.

- **Repro, before.** `gmake -n record-check "CHANGE=demo \$(shell touch /tmp/x)"` in the worktree of `f3a53f17` created `/tmp/x`; `/usr/bin/make` did not.
- **Fails before.** With the new tests and the `Makefile` of `f3a53f17` (`git stash push Makefile`), `node --experimental-strip-types --test --test-name-pattern='as typed' test/verification-record.test.ts test/integrate-script.test.ts`: 2 tests, 0 pass, 2 fail, each in its `gmake` iteration after its `make` 3.81 iteration passed: `gmake record ran a $(shell) of the arguments` and `gmake ran a $(shell) of the arguments`.
- **Passes after.** The same command with the fixed `Makefile`: 2 tests, 2 pass, each under `make` 3.81 and `gmake` 4.4.1. The repro no longer creates `/tmp/x` under either make.
- **Linux.** `debian:trixie-slim` with GNU Make 4.4.1, run through `scripts/docker-slot.ts`, 25 runs per case with a random extra environment variable each: the `Makefile` of `f3a53f17` expanded the arguments of `make integrate` and of `make record-check` in 25 of 25 runs, the fixed one in 0 of 25.
- **Intermittent integrate test.** Not reproduced: the expansion under GNU Make 4.4.1 happened in every run on macOS and on Debian ([design](design.md), D3).

## Checks

`make verify` ran on the clean committed tree of `36929732` (tree `a7c8054f`) with Node.js 24.22.1, after every review fix and after the pass 3 records: exit 0, profile full. Tests: 2650, 2643 pass, 0 fail, 0 cancelled, 7 skipped. Coverage of all files: lines 99.36%, branches 92.52%, functions 99.06%. It ran the two "as typed" tests under `make` 3.81 and `gmake` 4.4.1. `make record` wrote the generated part below from that log, and `make record-check` passed. Only the records commit that writes this paragraph and the generated part follows it before the archive, and it changes only this file.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `a7c8054f7d3b4a773b710fede9e7485997ba7977`; tests 2650, pass 2643, fail 0, skipped 7; all files 99.36% lines, 92.52% branches, 99.06% functions.
- `npm run openspec -- validate fix-make-argument-expansion --strict`: passed, `Change 'fix-make-argument-expansion' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 60 file(s); every pass summary file is valid: 40 file(s).`.
- Spec diff against the merge base `f3a53f172dc2` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6.1-sol#medium` | `01a18170-2d21-7473-b894-3e58f95f8cd3` | 0 | 0 | 0 | 0 |
| 2 | B | `claude claude-opus-5-5#high` | `36d32c77-543a-4229-a7f1-a54173f11108` | 0 | 0 | 2 | 3 |
| 3 | A | `codex gpt-6.1-sol#medium` | `01a18182-d5e2-7602-a406-aa3832362160` | 0 | 0 | 1 | 0 |
<!-- make record: end -->

## Review

### Pass 1 (reviewer A)

- **Reviewer:** Codex CLI, `gpt-6.1-sol`, reasoning effort medium, read-only sandbox, confirmed in the output header.
- **Invocation:** `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, prompt outside the worktree.
- **Session:** `01a18170-2d21-7473-b894-3e58f95f8cd3`.
- **Reviewed revision:** `05cac8af`.
- **Snapshot:** the same before and after the pass (`2e4eb301`).
- **Findings:** Critical 0, High 0, Medium 0, Low 0. The reviewer checked all six arguments from the command line and the environment under GNU Make 3.81 and 4.4.1, the absence of `include` lines before the `unexport`, sub-make isolation, and a missing `gmake`.

### Pass 2 (reviewer B)

- **Reviewer:** Claude Code, `claude-opus-5-5`, effort high, plan mode with Edit, Write, and NotebookEdit disallowed; `claude-opus-5-5` in the `modelUsage` of the last result line.
- **Invocation:** `claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format stream-json --verbose < /dev/null > <log>`, prompt and log outside the worktree.
- **Session:** `36d32c77-543a-4229-a7f1-a54173f11108`.
- **Reviewed revision:** `dc2fe5e9`; pass 1 had no findings, so the pass reviewed the whole change independently.
- **Snapshot:** the same before and after the pass (`74c57fad`).
- **Findings:** Critical 0, High 0, Medium 2, Low 3, all fixed:
  - M1, stale records and a failing `make record-check`: `make verify` and `make record` ran again (`3c90ab43`).
  - M2, only GNU Make 4.4 hosts catch the regression: design D2 and the limitations say so; GNU Make 4.3 was checked in the pinned `ubuntu:24.04` image (`19890efb`).
  - L1, no shell payload in `BRANCH` or `RESUME`: the integrate test passes one in each and fails when either leaves the `unexport` line under GNU Make 4.4.1 (`1b2783d5`, `b3f51341`).
  - L2, pass 1 still open in the records: task 4.1 ticked and the gate removed (`cd7ee291`).
  - L3, the spec delta dropped the change from the record requirement: it names CHANGE's `verification.md` again, 499 characters (`b3f51341`).

### Pass 3 (reviewer A)

- **Reviewer:** Codex CLI, `gpt-6.1-sol`, reasoning effort medium, read-only sandbox, confirmed in the output header.
- **Invocation:** `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, prompt outside the worktree.
- **Session:** `01a18182-d5e2-7602-a406-aa3832362160`.
- **Reviewed revision:** `82f47666`.
- **Snapshot:** the same before and after the pass (`b3773fb2`).
- **Findings:** Critical 0, High 0, Medium 1, Low 0. The reviewer confirmed the fixes of M2, L1, L2, and L3 of pass 2.
  - M1, M1 of pass 2 partly unresolved: the checks paragraph still named the first verified tree `7440b84e` of `cac17956` and said the commits after it changed only this file and `tasks.md`, though `1b2783d5` changed a test and `b3f51341` the spec delta. **Unreviewed fix:** the paragraph names the revision and tree of the final `make verify` run and the commits after it; fixed after the last pass and not reviewed.

## Limitations

- The fix was checked under GNU Make 3.81 and 4.4.1 only; the Linux check ran the shell repro, not the Node.js tests.
- The other targets that `design.md` lists still expand their command-line variables under every GNU make.
- Only hosts with GNU Make 4.4 or later as `make` or `gmake` catch this regression; CI's `ubuntu-latest` has GNU Make 4.3, which does not export to `$(shell)`, so CI passes either way ([design](design.md), D2). A `make doctor` check is a possible follow-up.

## Archive checks

Run on the tree of the archive commit, the archive of `877db6eb` on merge base `f3a53f17` with `origin/dev`, on 2026-10-28, as the uncommitted working tree before the commit:

- `npm run openspec -- archive fix-make-argument-expansion --yes`: archived as `2026-10-28-fix-make-argument-expansion`; `agent-task-protocol` 2 modified.
- `npm run openspec -- validate --all --strict`: `Totals: 69 passed, 0 failed (69 items)`.
- `npm run openspec -- validate --archived --no-interactive`: `change/2026-10-28-fix-make-argument-expansion` passes; the command reports 220 passed, 14 failed, all 14 older archived changes with open tasks.
- `git diff f3a53f17 -- openspec/specs`: only `openspec/specs/agent-task-protocol/spec.md`, 10 insertions and 2 deletions, in the two modified requirements "Shared integration command" and "Generated verification record", each with its new scenario "Arguments as typed under GNU Make 3.81 and 4.4".
- The moved change has `findings.jsonl` (6 lines) and `passes.jsonl` (3 lines); `make findings ARGS="validate"`: 60 findings files and 40 pass summary files valid.
- `make verify` on that working tree: passed, profile full, no stamp because the tree was uncommitted. Tests: 2650, 2643 pass, 0 fail, 0 cancelled, 7 skipped. Coverage of all files: lines 99.36%, branches 92.51%, functions 99.06%. `verify:archive` found no active change.
- `make record-check`: finds the archived change and fails with 3 problems, as expected without a new `make record`: the working tree differs from the verified tree `a7c8054f` in the moved change and the living spec, and the archived form recomputes the OpenSpec line as `validate --all` and the spec diff as non-empty. The generated part stays the record of `36929732`.

## Remaining gates

- Full `make verify` of the clean archive commit directly before the push, whose stamp the `pre-push` hook reuses, and the handoff to the coordinator.
- Integration into dev by the coordinator (single pull request)

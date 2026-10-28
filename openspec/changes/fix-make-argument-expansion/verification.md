# Verification

Date: 2026-10-28. The author's verification and `make verify` are recorded below; no review pass has run yet.

## Scope and source

Worker Pepi's brief of 2026-10-28 for the change `fix-make-argument-expansion` (size S, commit type `chore`), a regression of pull request #383 under GNU Make 4.4 reported by worker Liki (GNU Make 4.4.1 on Ubuntu). The worktree work was done in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/fix-make-argument-expansion` on branch `fix-make-argument-expansion`.

- **Base revision:** `f3a53f17` (`origin/dev`, merge of pull request #383).
- **Scope:** `Makefile` (the `unexport` line and its comment); `test/gnu-makes.ts` (new), `test/verification-record.test.ts`, and `test/integrate-script.test.ts`; the `agent-task-protocol` spec delta.
- **Out of scope:** the other targets that take command-line variables, which `design.md` ("Other free-form arguments") lists; their expansion predates pull request #383.

## Author self-check

- **Root cause found, not assumed.** Minimal Makefiles under GNU Make 4.4.1 show that the expansion comes from the parse-time `$(shell)` calls at lines 2, 3, and 7 of the `Makefile` of `f3a53f17`, which run before its `unexport` line at line 277; the `export X := $(value VAR)` copies pass the value intact once the variable is unexported ([design](design.md), "Root cause").
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

To be completed after `make verify` on the committed tree.

## Limitations

- The fix was checked under GNU Make 3.81 and 4.4.1 only; the Linux check ran the shell repro, not the Node.js tests.
- The other targets that `design.md` lists still expand their command-line variables under every GNU make.

## Remaining gates

- Review pass 1 (reviewer A) and pass 2 (reviewer B), as the coordinator assigns them.
- Archive of the change.
- Integration into dev by the coordinator (single pull request)

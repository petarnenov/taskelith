# Verification

Date: 2026-10-28. The author's verification and `make verify` are recorded below; the review passes follow.

## Scope and source

The coordinator's brief of 2026-10-28 (Niki, owner-approved the same day) for the change `run-reviews-through-make`, size S-M, commit type `chore`: one command, `make review`, that runs the route before pass 1 and starts each reviewer with its fixed invocation in a secret-free environment, and records the pass line; coordinator decision 3 replaced the written line with a printed template. Out of scope: moving the Jev key, a gate in `make record-check` or `make integrate` that rejects passes not run through `make review`, and parsing review findings.

- **Base revision:** `bbce0e81` (`origin/dev`, merge of pull request #390).
- **Implementation:** `e5a34a26`: `scripts/review-run.ts` and `scripts/reviewer-invocations.ts` (new), their tests `test/review-run.test.ts` and `test/reviewer-invocations.test.ts` (new), the `make review` target, `docs/agent-task-protocol.md` (worker step 5, "Reviewer invocations"), the skills `taskelith-task-protocol` and `taskelith-worker`, and this change's proposal, design, spec delta, tasks, and `checklist.json`.
- **Exit statuses:** `aabbeb1e` states in the protocol and the spec scenarios that the exit statuses are those of `scripts/review-run.ts`, because `make` itself exits 2.
- **Route:** the third route, committed unedited after decision 3, came from the exit 3 path of `make review CHANGE=run-reviews-through-make PASS=1 ...` on the stamped tree of `21888276`, because decision 3 changed files outside the change directory: tier `elevated` (trigger `lines`), rule version 1, recommending `codex gpt-6.1-sol#high` and `claude claude-opus-5-5#xhigh`; the shadow router `jev-1.14.0` agreed (0.57); no reviewer ran. The second (`2524c111`), from `make findings ARGS="route --change run-reviews-through-make"` on the test fix, was deleted by that path; the first route (`842117db`, on `aabbeb1e`, shadow 0.54) was deleted after the test fix changed the diff: tier `elevated` (trigger `lines`), rule version 1, recommending `codex gpt-6.1-sol#high` and `claude claude-opus-5-5#xhigh`; the shadow router `jev-1.14.0` agreed (0.59). Governance "Routed effort" does not yet authorize those efforts, so the brief's reviewers run at their authorized efforts.
- **Test fix:** `dc035f4b`: the first `make verify` on `566edd3d` failed 1 of 3079 tests, `pass 1 with a fresh route runs the reviewer without the caller's secrets`, because Node.js test coverage adds `NODE_V8_COVERAGE` to every child process, also one started with an explicit environment; the test now ignores that variable with the shell's own (`PWD`, `SHLVL`, `_`, `OLDPWD`). `make review` runs without coverage, so its reviewers do not get it. The fix changed the diff after the route, so, as worker step 4 asks, `route.json` was deleted and routed again on the fixed tree.
- **Coordinator decisions:** Niki decided the five open questions on 2026-10-28 ([design](design.md)); decision 3 changed the pass line: `make review` writes no `passes.jsonl` line and prints a template whose count placeholders fail the pass schema, and the worker appends the filled line after the report. That change touched files outside the change directory, so `route.json` was routed again.
- **Checklist:** saved with the brief's invocation plus `--save run-reviews-through-make --at bbce0e81d8e6a7a5ec0098e6c23655f80676c2c9 --size S-M`, because `dev` had moved past the brief's `4e3f8224`.

## Environment

macOS (Darwin 25.6.0), Node.js 24.22.1 and npm 12.2.1 from `.nvmrc` and the CI pin.

## Author self-check

- **Scope.** One layer: the target, two scripts, their tests, and the documents the brief names. No change to the route command, the findings schemas, `make record-check`, or `make integrate`.
- **Route gate.** `routeGate` (`scripts/review-run.ts`) runs only for pass 1. A route is fresh when its `devCommit` is the current merge base and `git diff --quiet <headCommit> HEAD -- . ':(exclude)openspec/changes/<change>'` passes. A missing or stale route needs a clean tree with a stamp (`checkStamp` of `scripts/verify-stamp.ts`, the profile from `decideProfile`); then a stale `route.json` is deleted, the route command runs in process, and the command exits 3 without running the reviewer, because worker step 4 needs `route.json` committed before the recorded `make verify`. Without the stamp it exits 1.
- **Environment.** `reviewerEnvironment` (`scripts/reviewer-invocations.ts`) builds the child's whole environment from `BASE_ENVIRONMENT` and the row's names; `spawn` gets only that object, so nothing is inherited.
- **Invocations.** The nine rows equal the arguments of the former protocol table, with `<authorized effort>` replaced by the efforts of governance "Authorized reviewers"; stdin is the prompt file for Codex and closed (`'ignore'`, which is `/dev/null`) for the others.
- **Records.** `make review` writes no pass line; `passLineTemplate` prints the change, pass, role, canonical reviewer, and session with the strings `<critical>`, `<high>`, `<medium>`, and `<low>` as counts, which the pass schema rejects, so an unfilled paste fails `make findings ARGS="validate"`.
- New comments are at most two lines of at most 80 characters; `npm run verify:comments` passes.
- Requirement lengths: "Review command" 488, "Review route gate" 334, "Reviewer environment" 215 characters, under the 500 of the pinned OpenSpec.
- Commit types are `chore` and `docs`, without attribution.

## Evidence check

- **Links.** The change's records link only root-relative or inside the change directory; `npm run verify:links` runs in `make verify`.
- **No real reviewer.** The tests start stub `codex` and `claude` scripts from a temporary `PATH`; no reviewer CLI ran for this change before review.
- **Make arguments.** `make review ... REVIEWER="codex gpt-6.1-sol#high"` printed the usage with the nine keys and exited 2; `CHANGE='$(shell echo expanded)'` reached the script as typed (test `make review passes its arguments to the script unexpanded`).

## Fail-before

Each mutation was applied to the working tree of `e5a34a26` before commit, the two test files were run with `node --experimental-strip-types --test`, and the file was restored:

- **Environment.** `reviewerEnvironment` returning the inherited environment without `JEV_MAF_LAB`, the effect of the old `env -u JEV_MAF_LAB`: 3 of 19 tests fail, `the environment keeps only the base variables and the reviewer's own`, `pass 1 with a fresh route runs the reviewer without the caller's secrets`, and the pass-line test, because the planted `TASKELITH_FAKE_SECRET` reached the stub.
- **Route gate.** `routeGate` skipping every pass: 7 of 11 tests of `test/review-run.test.ts` fail, all six gate tests and the fresh-route test.
- **Fixed flags.** `-s read-only` removed from the Codex rows: 2 of 19 tests fail, `Codex runs read-only in the worktree with the prompt on stdin` and the fresh-route test.

- **No pass line.** The new test `a pass writes no line and prints a template that is invalid until filled` was run against the previous `scripts/review-run.ts` (`95fd95ba`, which still appended the line): 1 of 12 tests of `test/review-run.test.ts` fails, with one line in `passes.jsonl` where none was expected; with the change, 12 of 12 pass.

Before the change both test files fail to load, because the scripts do not exist.

## Checks

- `npm run openspec -- validate run-reviews-through-make --strict`: `Change 'run-reviews-through-make' is valid`.
- `node --experimental-strip-types --test test/review-run.test.ts test/reviewer-invocations.test.ts`: 21 tests, 21 pass.
- After decision 3, `make verify` on `75452e81` failed in its type check (`TS4104` at `test/review-run.test.ts`, a mutable return type; fixed in `7aba1c6b`), and on `7aba1c6b` in strict OpenSpec validation (task 4.2 under group 5; moved in `21888276`). It passed on `21888276`, whose stamp the route gate needed, and on `b927de52` with the new `route.json`, the run recorded below.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `56ce4b2724a833a86cc57e58a138f8ab96c87690`; tests 3079, pass 3055, fail 0, skipped 24; all files 99.38% lines, 92.69% branches, 99.07% functions.
- `npm run openspec -- validate run-reviews-through-make --strict`: passed, `Change 'run-reviews-through-make' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 67 file(s); every pass summary file is valid: 47 file(s); every route file is valid: 3 file(s).`.
- Spec diff against the merge base `bbce0e81d8e6` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Review

Not yet run.

## Limitations

- The per-reviewer allowlists were not run against the real CLIs, because tests stub them; a CLI that needs another variable fails its first run, which is no pass. Only this change's own pass 1 (Codex) and pass 2 (Claude Code), run through `make review`, check the Codex and Claude Code rows; the Antigravity and OpenCode rows stay unverified.
- The Antigravity session and model reading follow the protocol's description; no captured Antigravity log was available, so its test uses a constructed sample.

## Remaining gates

- Review pass 1 by reviewer A (Codex CLI gpt-6.1-sol), pass 2 by reviewer B (Claude Code claude-opus-5-5, effort high), and pass 3 if governance "Conditional third pass" requires it, run through `make review`, which checks the Codex and Claude Code allowlists against the real CLIs.
- The Antigravity and OpenCode allowlists stay unverified against their real CLIs until a first `make review` run of each.
- Archive on the branch (worker step 7) and handoff.
- Integration into dev by the coordinator (single pull request)

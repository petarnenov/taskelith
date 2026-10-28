# Verification

Date: 2026-10-28. The author's verification and `make verify` are recorded below; the review passes follow.

## Scope and source

The coordinator's brief of 2026-10-28 (Niki, owner-approved the same day) for the change `run-reviews-through-make`, size S-M, commit type `chore`: one command, `make review`, that runs the route before pass 1 and starts each reviewer with its fixed invocation in a secret-free environment, and records the pass line; coordinator decision 3 replaced the written line with a printed template. Out of scope: moving the Jev key, a gate in `make record-check` or `make integrate` that rejects passes not run through `make review`, and parsing review findings.

- **Base revision:** `bbce0e81` (`origin/dev`, merge of pull request #390).
- **Implementation:** `e5a34a26`: `scripts/review-run.ts` and `scripts/reviewer-invocations.ts` (new), their tests `test/review-run.test.ts` and `test/reviewer-invocations.test.ts` (new), the `make review` target, `docs/agent-task-protocol.md` (worker step 5, "Reviewer invocations"), the skills `taskelith-task-protocol` and `taskelith-worker`, and this change's proposal, design, spec delta, tasks, and `checklist.json`.
- **Exit statuses:** `aabbeb1e` states in the protocol and the spec scenarios that the exit statuses are those of `scripts/review-run.ts`, because `make` itself exits 2.
- **Route:** the third route, committed unedited after decision 3, came from the exit 3 path of `make review CHANGE=run-reviews-through-make PASS=1 ...` on the stamped tree of `21888276`, because decision 3 changed files outside the change directory: tier `elevated` (trigger `lines`), rule version 1, recommending `codex gpt-6.1-sol#high` and `claude claude-opus-5-5#xhigh`; the shadow router `jev-1.14.0` agreed (0.57); no reviewer ran. The second (`2524c111`), from `make findings ARGS="route --change run-reviews-through-make"` on the test fix, was deleted by that path; the first route (`842117db`, on `aabbeb1e`, shadow 0.54) was deleted after the test fix changed the diff: tier `elevated` (trigger `lines`), rule version 1, recommending `codex gpt-6.1-sol#high` and `claude claude-opus-5-5#xhigh`; the shadow router `jev-1.14.0` agreed (0.59). Governance "Routed effort" does not yet authorize those efforts, so the brief's reviewers run at their authorized efforts.
- **Test fix:** `dc035f4b`: the first `make verify` on `566edd3d` failed 1 of 3079 tests, `pass 1 with a fresh route runs the reviewer without the caller's secrets`, because Node.js test coverage adds `NODE_V8_COVERAGE` to every child process, also one started with an explicit environment; the test now ignores that variable with the shell's own (`PWD`, `SHLVL`, `_`, `OLDPWD`). `make review` runs without coverage, so its reviewers do not get it; review pass 1 showed that the exception hid a real path, and the fix starts the reviewer through `env -i` ([Pass 1](#pass-1)). The fix changed the diff after the route, so, as worker step 4 asks, `route.json` was deleted and routed again on the fixed tree.
- **Coordinator decisions:** Niki decided the five open questions on 2026-10-28 ([design](design.md)); decision 3 changed the pass line: `make review` writes no `passes.jsonl` line and prints a template whose count placeholders fail the pass schema, and the worker appends the filled line after the report. That change touched files outside the change directory, so `route.json` was routed again.
- **Checklist:** saved with the brief's invocation plus `--save run-reviews-through-make --at bbce0e81d8e6a7a5ec0098e6c23655f80676c2c9 --size S-M`, because `dev` had moved past the brief's `4e3f8224`.

## Environment

macOS (Darwin 25.6.0), Node.js 24.22.1 and npm 12.2.1 from `.nvmrc` and the CI pin.

## Author self-check

- **Scope.** One layer: the target, two scripts, their tests, and the documents the brief names. No change to the route command, the findings schemas, `make record-check`, or `make integrate`.
- **Route gate.** `routeGate` (`scripts/review-run.ts`) runs only for pass 1. A route is fresh when its `devCommit` is the current merge base and `git diff --quiet <headCommit> HEAD -- . ':(exclude)openspec/changes/<change>'` passes. A missing or stale route needs a clean tree with a stamp (`checkStamp` of `scripts/verify-stamp.ts`, the profile from `decideProfile`); then a stale `route.json` is deleted, the route command runs in process, and the command exits 3 without running the reviewer, because worker step 4 needs `route.json` committed before the recorded `make verify`. Without the stamp it exits 1.
- **Environment.** `reviewerEnvironment` (`scripts/reviewer-invocations.ts`) builds the child's whole environment from `BASE_ENVIRONMENT` and the row's names; since the pass 1 fixes the reviewer starts as `/usr/bin/env -i` with those assignments, so nothing is inherited, also not what Node.js adds to children.
- **Invocations.** The nine rows equal the arguments of the former protocol table, with `<authorized effort>` replaced by the efforts of governance "Authorized reviewers"; stdin is the prompt file for Codex and closed (`'ignore'`, which is `/dev/null`) for the others.
- **Records.** `make review` writes no pass line; `passLineTemplate` prints the change, pass, role, canonical reviewer, and session with the strings `<critical>`, `<high>`, `<medium>`, and `<low>` as counts, which the pass schema rejects, so an unfilled paste fails `make findings ARGS="validate"`.
- New comments are at most two lines of at most 80 characters; `npm run verify:comments` passes.
- Requirement lengths after the pass 1 fixes: "Review command" 487, "Review route gate" 334, "Reviewer environment" 275 characters, under the 500 of the pinned OpenSpec.
- Commit types are `chore` and `docs`, without attribution.

## Evidence check

- **Links.** The change's records link only root-relative or inside the change directory; `npm run verify:links` runs in `make verify`.
- **No real reviewer.** The tests start stub `codex`, `claude`, `opencode`, and `agy` scripts from a temporary `PATH`; no reviewer CLI ran for this change before review.
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
- `node --experimental-strip-types --test test/review-run.test.ts test/reviewer-invocations.test.ts`: 21 tests, 21 pass before review; 28 tests, 28 pass after the pass 1 fixes, with and without `NODE_V8_COVERAGE` set.
- After decision 3, `make verify` on `75452e81` failed in its type check (`TS4104` at `test/review-run.test.ts`, a mutable return type; fixed in `7aba1c6b`), and on `7aba1c6b` in strict OpenSpec validation (task 4.2 under group 5; moved in `21888276`). It passed on `21888276`, whose stamp the route gate needed, and on `b927de52` with the new `route.json`. After the pass 1 fixes it ran again on the committed tree, the run recorded below.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `89dee68664759f2078cdacd1b853cc689c0106aa`; tests 3087, pass 3063, fail 0, skipped 24; all files 99.38% lines, 92.69% branches, 99.07% functions.
- `npm run openspec -- validate run-reviews-through-make --strict`: passed, `Change 'run-reviews-through-make' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 67 file(s); every pass summary file is valid: 47 file(s); every route file is valid: 3 file(s).`.
- Spec diff against the merge base `bbce0e81d8e6` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6.1-sol#medium` | `01a18274-85fd-71a3-8252-b8b91a1849f0` | 0 | 1 | 5 | 2 |
<!-- make record: end -->

## Review

### Pass 1

Reviewer A: Codex CLI, `codex gpt-6.1-sol#medium`, run through `make review CHANGE=run-reviews-through-make PASS=1 ROLE=A ...` itself on `cd114abe`, session `01a18274-85fd-71a3-8252-b8b91a1849f0`. This was the first real-CLI check of the Codex row: `make review` printed `route: route.json was made for this tree`, the recommendation `codex gpt-6.1-sol#high` beside the authorized `#medium`, `environment: PATH HOME USER LANG TERM TMPDIR`, the session, and `model: gpt-6.1-sol (reported)`, and exited 0; Codex ran with that environment and reported its model and read-only sandbox in the header. Counts: Critical 0, High 1, Medium 5, Low 2, all fixed in `c4c8c0a9` and recorded in `findings.jsonl`:

1. **High, real paths.** Only the log's parent was resolved. `scripts/review-files.ts` resolves the prompt's real path and each log's real directory, refuses a log that is a symbolic link, has other hard links, or is no regular file, and opens logs with `O_NOFOLLOW`, truncating only after `fstat` shows one link; the Antigravity `.cli.log` gets the same checks.
2. **Medium, runtime variable.** Node.js adds `NODE_V8_COVERAGE` to every child while it is set; the reviewer now starts as `/usr/bin/env -i NAME=value ... <command>`, and the fresh-route test sets the variable and checks the child environment with only the stub shell's own `PWD`, `SHLVL`, `_`, and `OLDPWD` exempted.
3. **Medium, OpenCode model.** None of 15 captured `opencode run --format json` logs on this host has a model field, so the honest fix reads the model where OpenCode stores it: after the run, `opencode session export --standalone --sanitize <session>` in the same clean environment, whose assistant messages name provider, model, and variant (format taken from a real export of session `ses_e8447b3c8ffe8QYk8bdDlmTmcQ`). A missing, other, or differently varied model, or a failed export, exits 4; the `modelNote` fallback is gone, so the spec delta's "expected model" holds for every reviewer.
4. **Medium, Antigravity model.** The CLI logs the model by label, `Propagating selected model override to backend: label="Gemini 4 Argon (Medium)"` (its own logs of 2026-10-24), never by ID; only those lines count, each must name the row's label, and the `.cli.log` is emptied before each run, so a stale log confirms nothing.
5. **Medium, prompt alias.** A log with the prompt's device and inode, the same path, a hard link, or the `.cli.log`, is refused with exit status 1 before anything is opened for writing.
6. **Medium, I/O errors.** A missing log directory and a non-file log are refused before routing, file errors become exit status 1, a reviewer that cannot start (for example a prompt with a NUL byte in Claude Code's arguments) exits 4, and nested `finally` blocks close every opened descriptor.
7. **Low, route shape.** `routeRecord` accepts only a JSON object: `null` is a stale route for pass 1 and no recommendation later, and a malformed plan recommends nothing.
8. **Low, proposal.** It now says that passes 1 and 2 run through `make review`.

Fail-before: the new and changed tests were run against `cd114abe`'s scripts (with only the new, still unused `scripts/review-files.ts` present) and `NODE_V8_COVERAGE` set by the test: 10 of 28 tests failed (log `/private/tmp/claude-503/-Users-petarnenov-taskelith/a47a64d8-7019-44c2-84cc-37b09a09a7cd/scratchpad/mr-p1fix-fail-before.log`): the fresh-route test (`NODE_V8_COVERAGE` reached the stub), the link test (the symlinked log was accepted), the launch test (`ERR_INVALID_ARG_VALUE` thrown), the `route.json` test (`TypeError` on `null`), the OpenCode and Antigravity run tests, and the four table tests of the new confirmation; with the fixes, 28 of 28 pass. The direct `openFreshLog` test is new with the module and passed in both runs.

## Limitations

- The tests stub the reviewer CLIs; a CLI that needs another variable fails its first run, which is no pass. Pass 1 checked the Codex row against the real CLI; pass 2 (Claude Code), run through `make review`, checks the Claude Code row; the Antigravity and OpenCode rows stay unverified through `make review`.
- The Antigravity model label line is taken from the CLI's own default logs of 2026-10-24, not from a `--log-file` log of a `make review` run, and its `conversation_id` reading follows the protocol's description; the OpenCode export format is taken from one real export. Both stay unverified until a first `make review` run of each.

## Remaining gates

- Review pass 2 by reviewer B (Claude Code claude-opus-5-5, effort high), which checks the Claude Code allowlist against the real CLI, and pass 3 by reviewer A if governance "Conditional third pass" requires it after pass 2, run through `make review`.
- The Antigravity and OpenCode allowlists stay unverified against their real CLIs until a first `make review` run of each.
- Archive on the branch (worker step 7) and handoff.
- Integration into dev by the coordinator (single pull request)

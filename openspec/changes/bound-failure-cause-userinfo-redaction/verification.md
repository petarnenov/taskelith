# Verification

Date: 2026-10-27. The author's verification, `make verify` on `071822b`, and review pass 1 are recorded below; `make verify` after the pass 1 fixes and review pass 2 are pending.

## Scope and source

A coordinator brief from Niki: fix the ReDoS in the scheme-less user-information rule that #322 added to `packages/adapters/worker-control-plane-client/src/failure-cause.ts`, found by Pepi during the integration of #322. Developed in a briefed and checked subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)), in worktree `taskelith-worktrees/bound-failure-cause-userinfo-redaction` on branch `bound-failure-cause-userinfo-redaction`.

- **Base revision:** `5c60c15e` on `dev`; `dev` merged at `fe643864` as `071822b`.
- **Revision verified:** `381629a8` (the test `258e45cc` and the fix `381629a8`), then `2f078d3` (the pass 1 test `ebceb80` and fix `2f078d3`), plus this change's records.
- **Scope:** the user-information rule, two tests, and the `worker-runtime` delta. **Widened** by coordinator Niki on 2026-10-27 in response to review pass 1's M1: every redaction rule of `failure-cause.ts` is linear-time, which also changes the `[url]` and JWT rules and adds two tests.
- **Out of scope:** the logger's `redactText` in `@taskelith/observability`, which is only measured (see Limitations), and centralizing the log redaction rules (a separate next task).

## Merge of dev

`origin/dev` at `fe643864` merged cleanly as `071822b`. It brings #325, which changes the requirements "Journaled launch authorization" and "Execution ownership", not "Control-plane failure cause", and no file of `@taskelith/worker-control-plane-client`.

## Rules

- **User information, before:** `/[^\s/?#@:'"]+:[^\s/?#@'"]+@/g`, replaced by `[redacted]@`.
- **User information, after:** `/(?<![^\s/?#@'"])(:*)[^\s/?#@:'"]+:[^\s/?#@'"]+@/g`, replaced by `$1[redacted]@`.
- **URL, before:** `/\b[a-z][a-z0-9+.-]*:\/\/\S*/gi`, replaced by `[url]`.
- **URL, after:** `/(?<![a-z0-9+.-])((?:[a-z0-9]|[+.-](?![a-z]))*[+.-])??\b[a-z][a-z0-9+.-]*:\/\/\S*/gi`, replaced by `$1[url]`.
- **JWT, before:** `/eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g`, replaced by `[redacted]`.
- **JWT, after:** `/(?<![A-Za-z0-9_-])((?:(?!eyJ)[A-Za-z0-9_-])*)eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g`, replaced by `$1[redacted]`.
- **Why linear:** each rule starts a match only at the start of a run of its characters, so each run is tried once, and from there every character matches one branch, so a failed attempt scans the run a constant number of times (design decisions 1, 3, and 4).

## Author self-check

- The redaction still runs on the whole text before any cut; no length bound was added, so a secret of any length is redacted (design decision 6).
- Every existing test passes unchanged. A randomized comparison of the old and new user-information rule on 800,000 strings of up to 40 characters, over the separators, `:`, `@`, letters, a line break, and a non-ASCII letter, found no difference in output.
- The URL and JWT rules were compared exhaustively on every string of up to seven characters over two alphabets (11,111,111 and 5,380,840 strings), and on 1,000,000 random strings of up to 40 characters and 200,000 of up to 300 over a mixed alphabet; the old and new rules, and the whole rule sequence, gave no difference (design decision 5).
- The comments are at most two lines of at most 80 characters; `npm run verify:comments` passes.
- Commit types are `test`, `chore`, and `docs`; only the private `@taskelith/worker-control-plane-client` changes.
- The requirement body (478 characters) is unchanged; the guarantee is a scenario, so the body stays under the strict archive limit.

## Evidence check

- **User information fails on the base code.** At `258e45cc` (the test on the unmodified rule), after `npm run build`, `node --experimental-strip-types --test --test-reporter=tap packages/adapters/worker-control-plane-client/test/control-plane-failure-cause.test.ts`: 20 tests, 19 pass, 1 fail, `a long run without a user-information end is redacted in linear time` with `aaaaaa… took 2967 ms`.
- **User information timings.** `describeFailureCause(new Error(message))` from the built `dist/failure-cause.js`, one 60,000-character message per shape, base / fixed: `a` repeated 3,097 / 4 ms; `a:` 1,591 / 2 ms; `a:a` 2,011 / 2 ms; `ab:cd ` 3 / 4 ms; `a::` 937 / 2 ms; 30,000 `a`, `:`, 30,000 `b` 2,857 / 2 ms.
- **URL and JWT fail before their fix.** At `ebceb80` (the new tests on the rules of `381629a8`), after `npm run build`, the same command: 22 tests, 21 pass, 1 fail, `a long run without a URL or JWT end is redacted in linear time` with `token: a.a.a.a.a.a… took 1654 ms`.
- **URL and JWT timings.** The same measurement, before / after `2f078d3`: `token: ` and `a.` repeated 1,632 / 2 ms; `password: ` and `A-` 1,634 / 1 ms; `secret: ` and `.a` 1,712 / 1 ms; `authorization: ` and `a.b` 1,090 / 1 ms; `eyJ` 800 / 2 ms; `eyJ_` 649 / 2 ms. The URL shapes follow a secret key, whose rule then replaces the run, so the logger's quadratic `redactText` does not see it (see Limitations).
- **Every rule measured.** Each rule of `failure-cause.ts` alone, at 20,000, 40,000, and 80,000 characters, on 45 repeated units, among them `a.`, `.a`, `A.`, `a.b`, `eyJ`, `eyJ_`, `eyJ.`, `authorization`, `proxy-authorization`, `password:"`, `"\`, `token:`, `pass:`, `bearer `, and long runs of spaces after `authorization`: at most 14 ms at 80,000 characters after the fix.
- **Passes on the fix.** The same command at `2f078d3`: 22 tests, 22 pass, 0 fail.
- **Determinism.** The bound is 200 ms per shape against about 2 ms measured; no retry or sleep.
- **Links.** The change adds no external link.

## Checks

- Package tests with coverage at `381629a8`: `node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='packages/adapters/worker-control-plane-client/dist/**/*.js' --test-reporter=spec packages/adapters/worker-control-plane-client/test/*.test.ts`: 35 tests, 35 pass, 0 fail; `failure-cause.js` lines 100%, branches 95.83%, functions 100%.
- `make verify` on `071822b`, 2026-10-27 05:58:48 to 06:01:45 UTC, exit 0, run by the worker before review pass 1. `DOCKER_CONFIG` pointed at a scratch directory holding an empty `config.json` (`{}`), because Docker Desktop's credential helper hangs on this iMac; the pinned public images were pulled anonymously and no credentials were read. 2019 tests, 2017 passed, 0 failed, 2 skipped; coverage 99.29% lines, 92.14% branches, 99.05% functions; 0 breaking changes in all four contract documents against `fe643864b7b5` and "Contract documents have no undeclared breaking change."; OpenSpec `Totals: 70 passed, 0 failed (70 items)`; "Every active OpenSpec change archives into strictly valid specs."; "Every findings file is valid: 3 file(s)."; "Every comment is within the comment length rule."; "Packed file allowlist and installed CLI verification passed." This record had simply not been updated before the pass.
- After the pass 1 fixes, at `2f078d3`: package tests with coverage, the same command, 37 tests, 37 pass, 0 fail, `failure-cause.js` lines 100%, branches 95.83%, functions 100%; `npm run build` exit 0; `tsc -p tsconfig.check.json` exit 0. With the pass 1 records: `npm run verify:comments`: every comment is within the comment length rule; `npm run openspec -- validate bound-failure-cause-userinfo-redaction --strict`: valid; a scratch copy of `openspec/` archived (1 requirement modified, gaining only the new scenario) and `openspec validate --all --strict --no-interactive`: 69 passed, 0 failed; `make findings ARGS="validate"`: every findings file is valid (3 files).
- `make verify` after the pass 1 fixes: pending.

Environment: macOS (Darwin 25.6.0), Node 24.22.1 from `.nvmrc`.

## Independent review

### Review pass 1

- **Reviewer:** Codex CLI, model `gpt-6.1-sol`, reasoning effort medium, read-only sandbox, all confirmed in the output header; run by the worker (Pepi) from the worktree, with the prompt and log outside it.
- **Invocation:** `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`.
- **Session:** `01a17bf3-b5d4-7720-b031-8ad17b485dd0`.
- **Revision:** `071822b`.
- **Snapshot:** `b4f0ca84ee5045a3258fd6e5be00a1ee0d88535f8505587449a4e14dbd35bc04` before and after; unchanged.
- **Findings:** 0 Critical, 0 High, 2 Medium, 1 Low; all fixed, to be confirmed by pass 2.
  1. **M1:** the scenario "Pathological cause message" and the proposal promised that describing the whole cause takes linear time, but the `[url]` rule stayed quadratic on `a.` repeated, about 373, 1,895, and 5,952 ms at 20,000, 40,000, and 80,000 characters through the whole pipeline. **Fixed** by coordinator Niki's decision on 2026-10-27 to widen the scope rather than narrow the promise: the `[url]` rule and, found by the measurement of every rule, the JWT rule are linear with the same output (`ebceb80` test, `2f078d3` fix); the scenario says every failure-cause redaction rule takes linear time and names `a.` and `eyJ` among the shapes. The logger's `redactText` stays quadratic on such runs (Limitations).
  2. **M2:** this record said `make verify` had not run, though worker step 4 requires it before the first pass. **Fixed:** it had run on `071822b` before the pass and the record had not been updated; the run, its Docker workaround, and its results are under Checks, with the merge of `dev` at `fe643864`.
  3. **L1:** the design called the user-information rule's comment two lines; it is one. **Fixed** in the design's risks, which now describe the comments of all three rules.
- **Note, not a finding:** the 200 ms wall-clock bound has a wide margin but can be hit by a long scheduler pause on CI (Limitations).

### Review pass 2

Codex gpt-6.1-sol, pending.

## Limitations

- The time tests are wall-clock, with a margin of about a hundred times the fixed time and a fifth or less of the base time; a long scheduler pause on a loaded CI runner could still exceed 200 ms.
- The logger's `redactText` in `@taskelith/observability`, which the failure-cause pipeline calls between its rules, is quadratic on the same runs: alone, at 20,000, 40,000, and 80,000 characters, `a.` repeated takes 159, 635, and 2,537 ms, and `.a`, `A.`, `a.b`, `eyJ.`, and `proxy-` behave alike. Describing a bare 60,000-character `a.` run therefore still takes about 1.5 seconds (3.1 seconds before this change). It is outside this task's scope and is reported to the coordinator for a follow-up.

## Remaining gates

- `make verify` after the pass 1 fixes.
- Review pass 2 (Codex gpt-6.1-sol), because pass 1 had Medium findings.
- Archive.
- Integration into dev by the coordinator (single pull request).

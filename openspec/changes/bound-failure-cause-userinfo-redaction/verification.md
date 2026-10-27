# Verification

Date: 2026-10-27. The author's verification is recorded below; `make verify` and the independent review are pending.

## Scope and source

A coordinator brief from Niki: fix the ReDoS in the scheme-less user-information rule that #322 added to `packages/adapters/worker-control-plane-client/src/failure-cause.ts`, found by Pepi during the integration of #322. Developed in a briefed and checked subagent ([subagent execution](../../../docs/agent-task-protocol.md#subagent-execution)), in worktree `taskelith-worktrees/bound-failure-cause-userinfo-redaction` on branch `bound-failure-cause-userinfo-redaction`.

- **Base revision:** `5c60c15e` on `dev`.
- **Revision verified:** `381629a8` (the test `258e45cc` and the fix `381629a8`), plus this change's records.
- **Scope:** one redaction rule, two tests, and the `worker-runtime` delta.
- **Out of scope:** every other redaction rule, and centralizing the log redaction rules (a separate next task).

## Rule

- **Before:** `/[^\s/?#@:'"]+:[^\s/?#@'"]+@/g`, replaced by `[redacted]@`.
- **After:** `/(?<![^\s/?#@'"])(:*)[^\s/?#@:'"]+:[^\s/?#@'"]+@/g`, replaced by `$1[redacted]@`.
- **Why linear:** a match can start only where a run of characters outside `\s/?#'"@` starts, so each run is tried once; the user part stops at `:` and the password at `@`, so a failed attempt backtracks over the run at most once (design decision 1).

## Author self-check

- The redaction still runs on the whole text before any cut; no length bound was added, so user information of any length is redacted (design decision 3).
- Every existing test passes unchanged. A randomized comparison of the old and new rule on 800,000 strings of up to 40 characters, over the separators, `:`, `@`, letters, a line break, and a non-ASCII letter, found no difference in output.
- The new comment is one line of 74 characters; `npm run verify:comments` passes.
- Commit types are `test`, `chore`, and `docs`; only the private `@taskelith/worker-control-plane-client` changes.
- The requirement body (478 characters) is unchanged; the guarantee is a new scenario, so the body stays under the strict archive limit.

## Evidence check

- **Fails on the base code.** At `258e45cc` (the test on the unmodified rule), after `npm run build`, `node --experimental-strip-types --test --test-reporter=tap packages/adapters/worker-control-plane-client/test/control-plane-failure-cause.test.ts`: 20 tests, 19 pass, 1 fail, `a long run without a user-information end is redacted in linear time` with `aaaaaa… took 2967 ms`.
- **Timings.** `describeFailureCause(new Error(message))` from the built `dist/failure-cause.js`, one 60,000-character message per shape, base / fixed: `a` repeated 3,097 / 4 ms; `a:` 1,591 / 2 ms; `a:a` 2,011 / 2 ms; `ab:cd ` 3 / 4 ms; `a::` 937 / 2 ms; 30,000 `a`, `:`, 30,000 `b` 2,857 / 2 ms.
- **Passes on the fix.** The same command at `381629a8`: 20 tests, 20 pass, 0 fail.
- **Determinism.** The bound is 200 ms per shape against about 2 ms measured; no retry or sleep.
- **Links.** The change adds no external link.

## Checks

- Package tests with coverage at `381629a8`: `node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='packages/adapters/worker-control-plane-client/dist/**/*.js' --test-reporter=spec packages/adapters/worker-control-plane-client/test/*.test.ts`: 35 tests, 35 pass, 0 fail; `failure-cause.js` lines 100%, branches 95.83%, functions 100%.
- `npm run build`: exit 0.
- `npm run verify:comments`: every comment is within the comment length rule.
- `make findings ARGS="validate"`: every findings file is valid (2 files).
- `npm run openspec -- validate bound-failure-cause-userinfo-redaction --strict`: valid.
- Scratch archive: a copy of `openspec/` outside the worktree, `openspec archive bound-failure-cause-userinfo-redaction --yes` (1 requirement modified), then `openspec validate --all --strict --no-interactive`: 69 passed, 0 failed; the living requirement gained only the new scenario.
- `make verify`: not run by the author; the coordinator schedules the host slot.

Environment: macOS (Darwin 25.6.0), Node 24.22.1 from `.nvmrc`.

## Independent review

Independent review: Codex gpt-6.1-sol, pending.

## Limitations

- The time test is wall-clock, with a margin of about a hundred times the fixed time and a fifteenth of the base time.
- Other redaction rules, including the logger's `redactText`, were not audited for ReDoS; the six shapes run through the whole pipeline in a few milliseconds.

## Remaining gates

- `make verify`.
- Independent review (Codex gpt-6.1-sol).
- Archive.
- Integration into dev by the coordinator (single pull request).

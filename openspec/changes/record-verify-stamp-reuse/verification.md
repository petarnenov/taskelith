# Verification

Date: 2026-10-28. The author's verification and `make verify` are recorded below; the review passes follow.

## Scope and source

The coordinator's brief of 2026-10-28 (Niki) for the change `record-verify-stamp-reuse`, size S, commit type `chore`, from the owner's decision of 2026-10-28 that every integration records whether `make verify` ran or a stamp was reused. Scope: the integration line of `make integrate` with the tree, `ran` or `reused stamp of <time>`, the profile, the verify step's seconds, the change, the branch, and the start time; the same line after `BODY` in the integration pull request; one JSON line in `${XDG_STATE_HOME:-~/.local/state}/taskelith/integrations.jsonl`, whose failed append only warns; tests that fail before the change; and one sentence in coordinator step 2 of `docs/agent-task-protocol.md`. Out of scope: when a stamp is reused, the `pre-push` hook, and a report over the log.

- **Base revision:** `16667399` (`origin/dev`, merge of pull request #405).
- **Implementation:** `cd5e2dcd`: `scripts/integrate.sh`, `test/integrate-script.test.ts`, `docs/agent-task-protocol.md`, and this change's proposal, design, spec delta, tasks, `checklist.json`, and empty `findings.jsonl` and `passes.jsonl`. `scripts/verify-stamp.ts` is unchanged (design.md D4).
- **Route:** `f27c2dd2` commits `route.json` unedited, from `make findings ARGS="route --change record-verify-stamp-reuse"` on the clean tree of `cd5e2dcd`: tier `standard` (no trigger), rule version 2, recommending `codex gpt-6-astra#medium`, `claude claude-opus-5-5#medium`, and `codex gpt-6.1-sol#medium` for pass 3, the brief's reviewers. The shadow router `jev-1.14.0` answered P(third) 0.37 at threshold 0.4, tier `standard`, and agreed.
- **Checklist:** saved with the brief's invocation, `--at 1666739982106ec3e9663978b4f86cdd2fb72f1f --size S`.

## Environment

macOS (Darwin 25.6.0), Node.js from `.nvmrc` through nvm.

## Author self-check

- **Contract.** The spec delta "Integration verify record", the protocol sentence in coordinator step 2, and `record_integration` in `scripts/integrate.sh` name the same fields in the same order: tree, verify outcome, profile, verify seconds, change (the archived change directory), branch, and start time; the JSON keys are `tree`, `verify`, `profile`, `verifySeconds`, `change`, `branch`, and `started`, which the test of the ran path checks in that order.
- **Error handling.** A failed append warns on standard error and the run continues (design.md "Risks"); the line stays in the output and the pull request body. A run that fails or is interrupted in its verify step records nothing (design.md D3).
- **Redaction.** The line holds only a tree hash, the change and branch names, times, and seconds; no credential or environment value.
- **Scope.** No change to when a stamp is reused, to `.githooks/pre-push`, or to `scripts/verify-stamp.ts`.
- **Spec.** The added requirement has 395 characters of body, under the strict limit after archive.
- New comments are at most two lines of at most 80 characters; `npm run verify:comments` passes. Commit types are `chore` for the code and `docs` for the records, without attribution.

## Evidence check

- **External facts.** None.
- **Links.** The records link only inside the change directory; `npm run verify:links`, which `make verify` runs, passes.

## Fail-before

`test/integrate-script.test.ts` of this change was run against `scripts/integrate.sh` of `16667399` (the base file restored in the worktree for the run, then the new file put back; log `/private/tmp/claude-503/-Users-petarnenov-taskelith/06b2129b-88b1-474a-982f-61d6a1728b94/scratchpad/fail-before.log`): 27 tests, 23 passed, 4 failed: "a clean branch is merged, verified, pushed, landed, and cleaned up" (the pull request body lacks the line), "an integration that ran make verify records its line in the pull request and the log", "an integration that reused a stamp records the stamp time", and "a failed append to the integration log only warns" (no line printed). With the change all 27 pass.

## Checks

- `node --experimental-strip-types --test test/integrate-script.test.ts` before the commit: 27 of 27 passed.
- `npm run openspec -- validate record-verify-stamp-reuse --strict`: `Change 'record-verify-stamp-reuse' is valid`.
- `make verify` on the clean tree of `f27c2dd2`: passed on its first run, profile full, tree `3470bc95`, stamp written; tests 3517, pass 3508, fail 0, skipped 9 (log `/private/tmp/claude-503/-Users-petarnenov-taskelith/06b2129b-88b1-474a-982f-61d6a1728b94/scratchpad/verify-1.log`).
- `make verify` on the clean tree of `5b7527c2`, the pass 1 fix: passed, profile full, tree `951b88c3`, stamp written; tests 3518, pass 3509, fail 0, skipped 9 (log `/private/tmp/claude-503/-Users-petarnenov-taskelith/06b2129b-88b1-474a-982f-61d6a1728b94/scratchpad/verify-2.log`).

## Review

### Pass 1

Reviewer A: Codex CLI, `codex gpt-6-astra#medium`, run as `make review CHANGE=record-verify-stamp-reuse PASS=1 REVIEWER='codex gpt-6-astra#medium'`, model `gpt-6-astra`, effort medium, sandbox `read-only` reported, session `01a1841f-909a-7182-a55f-d2c003a4afc3`. The worktree snapshot was `985682dbbf01fedc0be3e6b8526bba8ebe3bbe5b716c52239a33486e94f25b0d` before and after the pass. Counts: Critical 0, High 0, Medium 1, Low 0, fixed in `5b7527c2` and recorded in `findings.jsonl`:

1. **Medium, contract-drift, `scripts/integrate.sh` (the open pull request branch).** A resume that continued an already open pull request, for example after a failed `gh pr merge`, printed a new integration line and appended it to `integrations.jsonl`, but merged the pull request without adding the line to its body, so the pull request carried no or stale evidence. The new `append_integration_line` reads the body with `gh pr view --json body` and writes it back with `gh pr edit --body`, the new line appended after a blank line, before `gh pr merge`; the coordinator's text and the lines of earlier attempts stay, and a failed read or edit stops the resume before the merge. The spec delta gains the scenario "Resume continues an open pull request", design.md D2 and D3 and the sentence in coordinator step 2 of `docs/agent-task-protocol.md` describe the edit, and the limitation is removed. The `gh` stub keeps the body in `GH_STATE.body` and answers `pr view` and `pr edit`; the new test "a resume with an open pull request appends its line to the body" checks that the edit's body is the coordinator body, the first attempt's line, and the resume's line, each identical to the content of its `integrations.jsonl` record, and the existing resume test expects the `pr view` call.

Fail-before: the two resume tests were run against `scripts/integrate.sh` of `78ff84e7`, the pre-fix file restored in the worktree for the run and the fixed file put back (log `/private/tmp/claude-503/-Users-petarnenov-taskelith/06b2129b-88b1-474a-982f-61d6a1728b94/scratchpad/fail-before-2.log`): 2 of 2 failed, "a resume after a failed merge merges the open pull request" (no `gh pr view` call) and "a resume with an open pull request appends its line to the body" (no `gh pr edit` call). With the fix, `test/integrate-script.test.ts` passes 28 of 28.

### Pass 2

Pending: pass 2 (role B, `claude claude-opus-5-5#medium`), and pass 3 (role A, `codex gpt-6.1-sol#medium`) only after a pass 2 with a Medium or worse finding, assigned by the coordinator.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `951b88c3178410cd3f78492e8231c8209be363fd`; tests 3518, pass 3509, fail 0, skipped 9; all files 99.43% lines, 92.66% branches, 98.92% functions.
- `npm run openspec -- validate record-verify-stamp-reuse --strict`: passed, `Change 'record-verify-stamp-reuse' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 82 file(s); every pass summary file is valid: 62 file(s); every route file is valid: 18 file(s).`.
- Spec diff against the merge base `166673998210` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a1841f-909a-7182-a55f-d2c003a4afc3` | 0 | 0 | 1 | 0 |
<!-- make record: end -->

## Limitations

- A failed append to the log loses that run's line from `integrations.jsonl`; it remains only in the script's output and the pull request body (design.md "Risks").
- The stamp time is read from the message of `verify-stamp.ts check full` (design.md D4); the reused-path test guards that coupling.
- The tests use stubbed `make`, `gh`, and `npm` against a local bare origin; no real integration ran.

## Remaining gates

- Independent review passes, assigned by the coordinator
- Archive the change after the review
- Integration into dev by the coordinator (single pull request)

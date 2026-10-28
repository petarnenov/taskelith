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
- **Spec.** The added requirement had 395 characters of body; after the pass 1 fix it has 457, under the strict limit after archive.
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
- `make verify` on the clean tree of `75731a5c`, after the pass 2 fixes: passed, profile full, tree `b4774ab0`, stamp written; tests 3520, pass 3511, fail 0, skipped 9 (log `/private/tmp/claude-503/-Users-petarnenov-taskelith/06b2129b-88b1-474a-982f-61d6a1728b94/scratchpad/verify-3.log`).

## Review

### Pass 1

Reviewer A: Codex CLI, `codex gpt-6-astra#medium`, run as `make review CHANGE=record-verify-stamp-reuse PASS=1 REVIEWER='codex gpt-6-astra#medium'`, model `gpt-6-astra`, effort medium, sandbox `read-only` reported, session `01a1841f-909a-7182-a55f-d2c003a4afc3`. The worktree snapshot was `985682dbbf01fedc0be3e6b8526bba8ebe3bbe5b716c52239a33486e94f25b0d` before and after the pass. Counts: Critical 0, High 0, Medium 1, Low 0, fixed in `5b7527c2` and recorded in `findings.jsonl`:

1. **Medium, contract-drift, `scripts/integrate.sh` (the open pull request branch).** A resume that continued an already open pull request, for example after a failed `gh pr merge`, printed a new integration line and appended it to `integrations.jsonl`, but merged the pull request without adding the line to its body, so the pull request carried no or stale evidence. The new `append_integration_line` reads the body with `gh pr view --json body` and writes it back with `gh pr edit --body`, the new line appended after a blank line, before `gh pr merge`; the coordinator's text and the lines of earlier attempts stay, and a failed read or edit stops the resume before the merge. The spec delta gains the scenario "Resume continues an open pull request", design.md D2 and D3 and the sentence in coordinator step 2 of `docs/agent-task-protocol.md` describe the edit, and the limitation is removed. The `gh` stub keeps the body in `GH_STATE.body` and answers `pr view` and `pr edit`; the new test "a resume with an open pull request appends its line to the body" checks that the edit's body is the coordinator body, the first attempt's line, and the resume's line, each identical to the content of its `integrations.jsonl` record, and the existing resume test expects the `pr view` call.

Fail-before: the two resume tests were run against `scripts/integrate.sh` of `78ff84e7`, the pre-fix file restored in the worktree for the run and the fixed file put back (log `/private/tmp/claude-503/-Users-petarnenov-taskelith/06b2129b-88b1-474a-982f-61d6a1728b94/scratchpad/fail-before-2.log`): 2 of 2 failed, "a resume after a failed merge merges the open pull request" (no `gh pr view` call) and "a resume with an open pull request appends its line to the body" (no `gh pr edit` call). With the fix, `test/integrate-script.test.ts` passes 28 of 28.

### Pass 2

Reviewer B: Claude Code, `claude claude-opus-5-5#medium`, run as `make review CHANGE=record-verify-stamp-reuse PASS=2 REVIEWER='claude claude-opus-5-5#medium'`, model `claude-opus-5-5` reported, effort medium, session `a7c8c597-e510-406c-a739-08652cf32c55`. The worktree snapshot was `b792357549d5ff7acd96274f6ed95425364e65d18bc33262fa85545c246eb4a8` before and after the pass. It confirmed the pass 1 fix. Counts: Critical 0, High 0, Medium 0, Low 5, each recorded in `findings.jsonl` as `fixed-unreviewed`:

1. **Low, error-handling, `scripts/integrate.sh:231-232`.** The archive check matched `archive/*-<branch>`, but the change name used `archive/<YYYY-MM-DD>-<branch>`; a branch `foo` with only `2026-10-27-bar-foo` passed the check and then exited 1 without a marker under `set -e` and `pipefail`. Fixed in `017ac7a3`: both use the dated pattern in `archived`, so a mismatch prints `NOT ARCHIVED <branch>` and exits 5, as coordinator step 2 of `docs/agent-task-protocol.md` already describes (`openspec/changes/archive/<date>-<change>/`). The new test "a branch whose name only ends another archived change is not integrated" failed before the fix (exit 1, expected 5) and passes after it.
2. **Low, clean-code (recorded as `naming`, the closest category), `scripts/integrate.sh:122-133`.** `record_integration` silently set the global `integration_line` that later steps read. Fixed in `017ac7a3`: `format_integration_line` prints the line of the merged tree, the caller assigns `integration_line="$(format_integration_line "$merged_tree")"`, and `record_integration` only prints the line and appends the JSON record. Behavior is unchanged; the existing tests of the line cover it.
3. **Low, missing test (recorded as `missing-fail-before-test`), `test/integrate-script.test.ts`.** No test showed that a failed `gh pr view` or `gh pr edit` on resume stops before `gh pr merge`. Fixed in `017ac7a3`: the `gh` stub fails `pr edit` under `FAKE_EDIT=fail`, and the test "a resume whose body edit fails stops before the merge" expects a non-zero exit, `gh pr edit` as the last `gh` call, no `gh pr merge`, and no `LANDED`. It guards existing behavior, so it passed before the fix as well.
4. **Low, contract-drift, `proposal.md:8` and `tasks.md:13`.** Neither mentioned appending the line to an open pull request on resume. Fixed in `4347c936`.
5. **Low, evidence-mismatch, `verification.md:24`.** The requirement body was given as 395 characters; the pass 1 fix grew it to 457, counted exactly on the body line of the spec delta. Fixed in `4347c936`.

Fail-before: the two new tests were run against `scripts/integrate.sh` of `a9dc4e88`, the pre-fix file restored in the worktree for the run and the fixed file put back: "a branch whose name only ends another archived change is not integrated" failed (status 1, expected 5), and "a resume whose body edit fails stops before the merge" passed, as it covers existing behavior. With the fixes, `test/integrate-script.test.ts` passes 30 of 30.

The review ended at pass 2: it reported only Low findings, so no pass 3 runs (governance "Review sequence").

### Unreviewed fixes

No later pass reviews these fixes; each is marked unreviewed for the coordinator's architect check (governance "Architect check of unreviewed fixes").

1. Pass 2 findings 1 to 3 (`017ac7a3`): `scripts/integrate.sh` (the shared `archived` pattern, `format_integration_line`) and `test/integrate-script.test.ts` (two tests, the `FAKE_EDIT` stub mode).
2. Pass 2 findings 4 and 5 (`4347c936`): `proposal.md`, `tasks.md`, and the spec bullet of this record.

Architect check: pending, by the coordinator (Niki).

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `b4774ab01319a2682aeaff58f2c7bbdce1afae48`; tests 3520, pass 3511, fail 0, skipped 9; all files 99.43% lines, 92.66% branches, 98.92% functions.
- `npm run openspec -- validate record-verify-stamp-reuse --strict`: passed, `Change 'record-verify-stamp-reuse' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 82 file(s); every pass summary file is valid: 62 file(s); every route file is valid: 18 file(s).`.
- Spec diff against the merge base `166673998210` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`:

| Pass | Role | Reviewer | Session | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | A | `codex gpt-6-astra#medium` | `01a1841f-909a-7182-a55f-d2c003a4afc3` | 0 | 0 | 1 | 0 |
| 2 | B | `claude claude-opus-5-5#medium` | `a7c8c597-e510-406c-a739-08652cf32c55` | 0 | 0 | 0 | 5 |
<!-- make record: end -->

## Limitations

- A failed append to the log loses that run's line from `integrations.jsonl`; it remains only in the script's output and the pull request body (design.md "Risks").
- The stamp time is read from the message of `verify-stamp.ts check full` (design.md D4); the reused-path test guards that coupling.
- The tests use stubbed `make`, `gh`, and `npm` against a local bare origin; no real integration ran.

## Remaining gates

- Archive the change
- Architect check of the unreviewed fixes by the coordinator (Niki)
- Integration into dev by the coordinator (single pull request)

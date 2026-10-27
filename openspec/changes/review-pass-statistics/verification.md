# Verification: review-pass-statistics

## Scope and source

Coordinator brief from Niki, which the owner approved on 2026-10-27: per-reviewer statistics from the review records, namely passes, findings by severity, findings per pass, the share of passes with at least one Medium or worse finding, and later-found misses. Developed by a subagent briefed by the coordinator, under "Subagent execution" of `docs/agent-task-protocol.md`, in the git worktree `../taskelith-worktrees/review-pass-statistics` on branch `review-pass-statistics`. Base revision: `d3e9e636` on `dev`. Scope: pass summaries in `passes.jsonl` with `docs/review-findings/pass.schema.json`, the optional `missedBy` finding field, their validation, the `reviewers [--json]` command, `docs/agent-task-protocol.md` worker steps 2, 5, 6, and 7 and "Review findings record", the governance sentence on which records name the role of each pass, the `taskelith-task-protocol` and `taskelith-worker` skills, and the `review-process` and `agent-task-protocol` deltas. Exclusions: no backfill of archived records, no change to the output of the index and checklist commands, which, like every command, now refuse to run on invalid pass summaries or summaries that disagree with the findings, and no statistics over active changes. Commit types `chore` and `docs`: nothing here is in the published package's `files` allowlist.

## Revision

Tooling and tests: `58ef3a13` on base `d3e9e636`. Documentation and change records: `a1314b1e`, which the first `make verify` below ran on, and the first verification record `2757558a`, which review pass 1 ran on. Review pass 1 fixes: `77f8c2a3`; their record follows it.

## Environment

Ubuntu 24.04.5 LTS (Linux 6.8.0-147-generic, x86_64), Node.js v24.22.1 from `.nvmrc`.

## Author self-check

Against the review checklist of the brief and ADR 0004:

1. Contract drift: the finding and pass schemas, `scripts/review-passes.ts`, `docs/agent-task-protocol.md`, the skills, and both deltas state the same rules. The pass schema refers to the finding schema's definitions instead of copying them (`design.md` decision 2). The governance sentence that `findings.jsonl` records the role of each pass now names `passes.jsonl`, which holds the role. The `agent-task-protocol` requirement "Review findings in the task flow" is modified to name `passes.jsonl` (`design.md` decision 10).
2. Redaction: summary lines pass through the same `checkedValue` function as finding lines, so the secret-like-value check runs before the schema and no diagnostic echoes the input; `test/review-passes.test.ts` asserts that a token in a summary is rejected and not repeated. Cross-file messages print only pass numbers, roles, severities, and counts.
3. Error handling: cross-file checks run only when both files parse cleanly, so a broken line is reported once (`test/findings.test.ts` "a broken line is reported once, without the cross-file checks"); `reviewers` fails with exit code 1 on invalid records, like `index`.
4. Process: the role is recorded, not derived from the pass number, because a task under the one-reviewer rule and a fourth pass have no fixed role (`design.md` decision 6).
5. Docs and evidence: the counts and results below come from the commands listed.

Evidence check: no external link is added.

## Checks

- `npm run openspec -- validate review-pass-statistics --strict`: `Change 'review-pass-statistics' is valid`.
- Requirement bodies: "Review pass summaries" 445, "Pass summary consistency" 307, "Missed finding attribution" 318, "Reviewer statistics" 430, and the modified "Review findings in the task flow" 416 characters.
- Tests that fail on the base code: the new and changed tests were copied into a scratch worktree of `d3e9e636` and run there. `test/findings.test.ts` fails to load (`does not provide an export named 'PASS_SCHEMA_PATH'`), `test/review-passes.test.ts` and `test/reviewer-statistics.test.ts` fail to load (module not found), and `test/review-findings.test.ts` fails 1 of 29, the new `missedBy` test.
- Tests of the findings tooling on `a1314b1e`: `test/findings.test.ts` 18 (12 before), `test/review-findings.test.ts` 29 (28 before), `test/review-passes.test.ts` 8, and `test/reviewer-statistics.test.ts` 3, all passing.
- `npm run findings -- reviewers` on this repository, after the pass 1 fixes: 17 archived changes with review records and 30 passes; all 17 have `findings.jsonl` but no `passes.jsonl`, so every pass is derived from findings with role `(unknown)`, and 174 archived changes have neither file and are not counted, as the output states. Before the fixes the output named only the 17 and left the 174 out (pass 1, Medium).
- `make verify` on `a1314b1e`: exit 0. `npm run verify:comments`: `Every comment is within the comment length rule.` `npm run verify:findings`: `Every findings file is valid: 18 file(s); every pass summary file is valid: 1 file(s).` `npm test`: 2117 tests, 2070 passed, 0 failed, 47 skipped; coverage of all files 99.22% lines, 92.04% branches, 98.86% functions. Contract compatibility: 0 breaking changes in each of the four documents. `npm run openspec -- validate --all --strict --no-interactive`: 70 passed, 0 failed. `npm run verify:archive`: `Every active OpenSpec change archives into strictly valid specs.` `npm run verify:package`: `Packed file allowlist and installed CLI verification passed.`
- Coverage note: `npm test` measures coverage over the built product modules (`dist/`), not over `scripts/`, so the new scripts do not change the coverage figures; their tests cover every command and rule above.

## Independent review

### Pass 1 (reviewer A)

Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`, on `2757558a`, session `01a17d0a-add2-7f12-8c55-309cee0eeee9`, run by the coordinator:

`codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`

Model confirmation: the Codex header reported model `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`. Read-only proof: the SHA-256 snapshot of all tracked and untracked files was the same before and after the pass. Result: 0 Critical, 0 High, 1 Medium, 1 Low, recorded in `findings.jsonl` and summarized in `passes.jsonl`. Fixes in `77f8c2a3`:

- Medium, contract-drift: `scripts/findings.ts` dropped archived changes with neither `findings.jsonl` nor `passes.jsonl` before the statistics, so the warning about incomplete history named only the changes derived from findings. The statistics now take the number of such changes; the text states it on its own line and the JSON as `unrecordedChanges`. A new test covers an archive with neither file, the `review-process` delta has the scenario "Archived change without any review record", and the protocol, `design.md` decision 8, the proposal, and the evidence above say the same.
- Low, docs: the `Makefile` comment of the `findings` target now lists `reviewers [--json]`, within the comment length rule.

The Low finding was fixed together with the Medium one, so pass 2 checks both.

After the fixes, on `77f8c2a3` with this record and the pass 1 lines of `findings.jsonl` and `passes.jsonl`:

- Tests of the findings tooling: `test/findings.test.ts` 19, the other three files unchanged in count, all passing.
- `make verify`: exit 0. `npm run verify:findings`: `Every findings file is valid: 18 file(s); every pass summary file is valid: 1 file(s).` `npm test`: 2118 tests, 2071 passed, 0 failed, 47 skipped; coverage of all files 99.22% lines, 92.06% branches, 98.86% functions. Contract compatibility: 0 breaking changes in each of the four documents. `validate --all --strict --no-interactive`: 70 passed, 0 failed. `verify:archive`, `verify:comments`, and `verify:package` passed.

### Pass 2 (reviewer B)

Claude Code, model `claude-opus-5-5`, effort `high`, permission mode `plan`, editing tools disallowed, on `3826ce09`, session `b9dd8328-a3f9-4019-8a8f-34bf26340389`, run by the coordinator:

`claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`

Model confirmation: the JSON `modelUsage` named only `claude-opus-5-5`. Read-only proof: the SHA-256 snapshot of all tracked and untracked files was the same before and after the pass. The pass confirmed both pass 1 fixes, which keep the outcome `fixed`. Result: 0 Critical, 0 High, 0 Medium, 5 Low, recorded in `findings.jsonl` and summarized in `passes.jsonl`. A Low-only pass ends the review under governance "Low findings are fixed", so there is no pass 3; the five fixes, in `b58d380c`, are unreviewed fixes with the outcome `fixed-unreviewed`:

- Low, error-handling: an archived change with `passes.jsonl` but no `findings.jsonl` skipped the cross-file checks. A missing `findings.jsonl` beside `passes.jsonl` now counts as empty and the checks run; a new test in `test/findings.test.ts` fails before the fix and passes after it. `design.md` decisions 4 and 5, the "Pass summary consistency" requirement, and the protocol say so.
- Low, contract-drift: the proposal and this record said the index and checklist commands were unchanged; they now say their output is unchanged and that they refuse to run on invalid or disagreeing pass summaries.
- Low, docs: the protocol and the "Reviewer statistics" requirement now name misses of a pass without a record, which are counted apart.
- Low, naming: `loadRepository` in `scripts/findings.ts` derives the missing files from the loaded records instead of listing the directories twice.
- Low, naming: the record source type is `RecordSource`, and `validOutput` takes `changes`. The vocabulary has no clean-code category, so this finding and the previous one are recorded as `naming`.

Requirement bodies after the fixes: "Review pass summaries" 445, "Pass summary consistency" 329, "Missed finding attribution" 318, "Reviewer statistics" 467, and "Review findings in the task flow" 416 characters.

After the fixes, on `b58d380c` with this record and the pass 2 lines of `findings.jsonl` and `passes.jsonl`: `test/findings.test.ts` 20 tests, all passing; `make verify` exit 0, with `npm run verify:findings` `Every findings file is valid: 18 file(s); every pass summary file is valid: 1 file(s).`, `npm test` 2119 tests, 2072 passed, 0 failed, 47 skipped, coverage of all files 99.22% lines, 92.09% branches, 98.86% functions, no undeclared breaking contract change, `validate --all --strict --no-interactive` 70 passed, 0 failed, and `verify:archive`, `verify:comments`, and `verify:package` passed.

## Limitations

- No archived change has `passes.jsonl` yet, so the statistics of this repository are derived from findings until changes reviewed under this rule are archived.

## Remaining gates

- Archive of the change by the worker (worker step 7).
- `make verify` by the `pre-push` hook on the pushed tree.
- Integration into dev by the coordinator (single pull request).

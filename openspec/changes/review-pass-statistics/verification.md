# Verification: review-pass-statistics

## Scope and source

Coordinator brief from Niki, which the owner approved on 2026-10-27: per-reviewer statistics from the review records, namely passes, findings by severity, findings per pass, the share of passes with at least one Medium or worse finding, and later-found misses. Developed by a subagent briefed by the coordinator, under "Subagent execution" of `docs/agent-task-protocol.md`, in the git worktree `../taskelith-worktrees/review-pass-statistics` on branch `review-pass-statistics`. Base revision: `d3e9e636` on `dev`. Scope: pass summaries in `passes.jsonl` with `docs/review-findings/pass.schema.json`, the optional `missedBy` finding field, their validation, the `reviewers [--json]` command, `docs/agent-task-protocol.md` worker steps 2, 5, 6, and 7 and "Review findings record", the governance sentence on which records name the role of each pass, the `taskelith-task-protocol` and `taskelith-worker` skills, and the `review-process` and `agent-task-protocol` deltas. Exclusions: no backfill of archived records, no change to the index or checklist commands, and no statistics over active changes. Commit types `chore` and `docs`: nothing here is in the published package's `files` allowlist.

## Revision

Tooling and tests: `58ef3a13` on base `d3e9e636`. Documentation and change records: `a1314b1e`, which `make verify` below ran on. This record follows them.

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
- `npm run findings -- reviewers` on this repository: 17 archived changes, 30 passes, all 17 without `passes.jsonl`, so every pass is derived from findings with role `(unknown)`, as the output states.
- `make verify` on `a1314b1e`: exit 0. `npm run verify:comments`: `Every comment is within the comment length rule.` `npm run verify:findings`: `Every findings file is valid: 18 file(s); every pass summary file is valid: 1 file(s).` `npm test`: 2117 tests, 2070 passed, 0 failed, 47 skipped; coverage of all files 99.22% lines, 92.04% branches, 98.86% functions. Contract compatibility: 0 breaking changes in each of the four documents. `npm run openspec -- validate --all --strict --no-interactive`: 70 passed, 0 failed. `npm run verify:archive`: `Every active OpenSpec change archives into strictly valid specs.` `npm run verify:package`: `Packed file allowlist and installed CLI verification passed.`
- Coverage note: `npm test` measures coverage over the built product modules (`dist/`), not over `scripts/`, so the new scripts do not change the coverage figures; their tests cover every command and rule above.

## Independent review

Pending: pass 1 by reviewer A, pass 2 by reviewer B if needed, pass 3 by reviewer A if needed, as the coordinator assigns them.

## Limitations

- No archived change has `passes.jsonl` yet, so the statistics of this repository are derived from findings until changes reviewed under this rule are archived.

## Remaining gates

- Independent review passes, their records in `passes.jsonl`, `findings.jsonl`, and this file.
- Archive of the change by the worker (worker step 7).
- `make verify` by the `pre-push` hook on the pushed tree.
- Integration into dev by the coordinator (single pull request).

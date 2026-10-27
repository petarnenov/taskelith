# Verification

Date: 2026-10-27. The author's verification and `make verify` are recorded below, then review pass 1 by reviewer A, its fixes, and `make verify` after them, and review pass 2 by reviewer B, Low-only, with its unreviewed fixes. Pass 3 did not run as a confirmation of the pass 2 fixes, which were Low-only; it ran as reviewer A's review of the merge of `579c227d` on 2026-10-28, which "Merge of dev" records.

## Scope and source

The coordinator's brief of 2026-10-27 for the change `normalize-reviewer-keys` (size S, tooling and documents, contract-first), which carries two decisions: the coordinator's decisions on the canonical reviewer key, its validation in active changes, and one alias table for archived records; and the owner decision of 2026-10-27 on the reviewer assignment, to be recorded in `docs/governance.md` under "Two alternating reviewers per task". The worktree work was done in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/normalize-reviewer-keys` on branch `normalize-reviewer-keys`.

- **Base revision:** `b87abe75` (`origin/dev`, merge of pull request #365).
- **Revision verified:** `0968b548`, on top of the spec delta, proposal, design, and tasks (`b737c9fc`) and the scripts and tests (`8cfe024c`); the records commit of this record adds only this file.
- **Scope:** `scripts/reviewer-keys.ts` (new) and `scripts/findings.ts`; `test/reviewer-keys.test.ts` (new) and `test/findings.test.ts`; the `harness`, `model`, and `variant` descriptions of `docs/review-findings/finding.schema.json`; `docs/governance.md` ("Two alternating reviewers per task" with the new "Reviewer assignment", "Rotation", "Unavailable reviewer"); `docs/agent-task-protocol.md` (worker step 5, coordinator step 1, "Review findings record", "Reviewer invocations"); `.claude/skills/taskelith-task-protocol/SKILL.md` and `.claude/skills/taskelith-coordinator/SKILL.md`; the `review-process` spec delta.
- **Changed command output:** `validate` rejects non-canonical keys of active changes; the "By reviewer" sections of `index` and `reviewers` show each reviewer once. The `checklist` output is unchanged, because it shows no reviewer.
- **Out of scope:** rewriting archived records; changing the schema's validation; `AGENTS.md`, whose review bullet names no reviewer or harness and points to the governance review process, which holds the assignment.

- **Coordinator decisions (Niki, 2026-10-27)** on the author's readings of the owner's table: for a task that needs network access, Claude Code (claude-fable-5-1) is reviewer A, passes 1 and 3, and Claude Code (claude-opus-5-5), effort `high`, stays reviewer B, the same harness being allowed by this assignment and named in `verification.md`; the turn orders only the replacements under "Unavailable reviewer", starting after the replaced reviewer and skipping reviewers that the table bars from that role; the statistics are given as measured, over all archived passes of each reviewer, not pass 1 only, naming only OpenCode CLI (deepseek-v4-pro) and OpenCode CLI (kimi-k3.1-pro); and the spec scope additions ("Reviewer assignment", the modified "Authorized alternating reviewers" and "Rotation order") are accepted. `docs/governance.md`, the spec delta, and `design.md` D6 already state these readings; the commit of these decisions changes only this record and `design.md`.

## Author self-check

- **Contract first.** `b737c9fc` holds the spec delta, proposal, and design before the scripts and tests (`8cfe024c`) and the governance text (`0968b548`).
- **Alias table.** `LEGACY_REVIEWER_ALIASES` (`scripts/reviewer-keys.ts:14`) is the one table: `claude-code claude-opus-5-5#high` to `claude claude-opus-5-5#high`; `opencode kimi-k2.7-code#default` and `opencode opencode-go/kimi-k2.7-code` to `opencode opencode-go/kimi-k2.7-code#default`. These are every non-canonical spelling of the scan in `design.md` (Context); `grep` for `"claude-code"`, `"model":"kimi`, and `"opencode-go/kimi-k2.7-code"}` over the archived records finds them only in `2026-10-27-record-placement-outcome` and `2026-10-27-revalidate-g3-foundations`.
- **Rule.** `reviewerKeyProblems` (`scripts/reviewer-keys.ts:29`) reports each broken rule; `checkChange` (`scripts/findings.ts:260`) applies it to the findings and pass summaries of active changes only, through `reviewerProblems` (`:292`); `commandOutput` (`:328`) reads archived changes through `withCanonicalReviewers` (`:299`) before `reviewers`, `index`, and `checklist`. The messages are those of `design.md` D4, and the tests assert them verbatim.
- **Statements checked against the code.** The protocol's "Validation" and "Legacy reviewer keys" bullets, the schema descriptions, the spec delta, and the proposal state the same rule, the same three spellings, and the same changed outputs.
- **Governance agrees with itself.** A case-insensitive search for `rotation` and `reviewer A` over `docs/`, `.claude/`, `AGENTS.md`, and `README.md` found the references to the turn for new tasks in worker step 5, coordinator step 1, and the coordinator skill, which now point to "Two alternating reviewers per task" or "Reviewer assignment". "Rotation" orders only replacements; "Unavailable reviewer" skips a reviewer that "Reviewer assignment" bars from the role; "Two alternating reviewers per task" allows the one-harness pair that the assignment names for tasks that need network access.
- **Statistics.** The reasons in governance are copied from the "before" table below: Codex CLI (gpt-6.1-sol) 8 High findings (the most of any reviewer), 68% of passes with a Medium or worse finding, 28 misses in 28 passes (1.0 per pass); OpenCode CLI (deepseek-v4-pro) 10 in 6 (1.67, given as 1.7) and OpenCode CLI (kimi-k3.1-pro) 15 in 8 (1.875, given as 1.9). The other OpenCode reviewers, kimi-k2.7-code and qwen3.8-max, have no misses, so governance names only the two reviewers the 1.7 and 1.9 belong to. The counts are over all archived passes of each reviewer, not pass 1 only, and governance says so.
- **Requirement length.** "Canonical reviewer key" 450, "Reviewer assignment" 382, "Authorized alternating reviewers" 493 (491 before), "Rotation order" 434 characters, under the 500 of the pinned OpenSpec; `npm run verify:archive` archives the change in a temporary copy into strictly valid specs. "Rotation order" keeps its five scenario names, because a MODIFIED block must, with "Reviewers of a new change" and "Reviewer after a replacement" reworded to the assignment.
- New comments are at most two lines of at most 80 characters; `npm run verify:comments` passes.
- Commit types are `docs` and `chore`; only private tooling and documents change, without attribution.

## Evidence check

- **Links.** The change's records link only inside the change directory or root-relative; `npm run verify:links` passes. No external link is added.
- **Fails before.** With the new tests and `scripts/findings.ts` and the schema of `b87abe75` (`git stash push -- scripts/findings.ts docs/review-findings/finding.schema.json`, and `scripts/reviewer-keys.ts` moved out of the tree), `node --experimental-strip-types --test test/findings.test.ts`: 26 tests, 22 pass, 4 fail:
  - `validate rejects a non-canonical reviewer key of an active change by file and line`: `validate` passed with exit 0.
  - `reviewers and index count the archived spelling "claude-code claude-opus-5-5#high" as its canonical reviewer`, and the same test for `opencode kimi-k2.7-code#default` and `opencode opencode-go/kimi-k2.7-code`: two rows, one per spelling, instead of one.
  
  `test/reviewer-keys.test.ts` failed to load, `ERR_MODULE_NOT_FOUND` for `scripts/reviewer-keys.ts`. The guard test `validate accepts canonical reviewer keys in active changes and legacy ones in archives` passes before and after. After restoring the tree, the five files `test/findings.test.ts`, `test/reviewer-keys.test.ts`, `test/review-findings.test.ts`, `test/review-passes.test.ts`, and `test/reviewer-statistics.test.ts`: 79 tests, 79 pass.

## Checks

Run on the working tree of `0968b548` with Node.js 24.22.0 and npm 11.19.1:

- `npm run openspec -- validate normalize-reviewer-keys --strict`: `Change 'normalize-reviewer-keys' is valid`.
- `make findings ARGS="validate"`, inside `make verify`: every findings file is valid, 43 files; every pass summary file is valid, 23 files.
- `make verify` (with `TMPDIR` on disk): exit 0. Tests: 2317, 2270 pass, 0 fail, 0 cancelled, 47 skipped (the skips are the platform-bound tests that the suite names, such as the composed worker's crash windows that run natively on macOS and on Linux in `make verify-linux-crash-windows`). Coverage of all files: lines 99.28%, branches 92.30%, functions 98.94%. `validate --all --strict`: 70 passed, 0 failed. Every comment is within the comment length rule; every checked link conforms; every active OpenSpec change archives into strictly valid specs; workspace and hexagonal boundary checks passed; 0 breaking changes in the four contract documents against `b87abe75`; 731 package paths verified, 41 with reviewed license coverage gaps; the package verification passed.

`make findings ARGS="reviewers"`, section "By reviewer", on `b87abe75` (before):

```text
    passes  critical      high    medium       low  per pass  >=medium    misses  key
        28         0         8        38        33      2.82       68%        28  codex gpt-6.1-sol#medium
        17         0         0        13        71      4.94       35%         0  claude claude-fable-5-1#medium
        16         0         3        29       104      8.50       63%         0  claude claude-opus-5-5#high
        10         0         2        13        14      2.90       50%         8  codex gpt-6-astra#medium
         8         0         2         7        14      2.88       50%        15  opencode opencode-go/kimi-k3.1-pro#high
         6         0         3         2        13      3.00       33%        10  opencode opencode-go/deepseek-v4-pro#high
         5         0         0         1        10      2.20       20%         0  opencode opencode-go/kimi-k2.7-code#default
         3         0         0         2         7      3.00       67%         0  opencode opencode-go/qwen3.8-max#medium
         1         0         0         1         9     10.00      100%         0  claude-code claude-opus-5-5#high
         1         0         0         0         1      1.00        0%         0  opencode kimi-k2.7-code#default
         1         0         0         0         0      0.00        0%         0  opencode opencode-go/kimi-k2.7-code
```

The same on `0968b548` (after); the totals, 42 changes with review records and 96 passes, and the "By role" section are unchanged:

```text
    passes  critical      high    medium       low  per pass  >=medium    misses  key
        28         0         8        38        33      2.82       68%        28  codex gpt-6.1-sol#medium
        17         0         0        13        71      4.94       35%         0  claude claude-fable-5-1#medium
        17         0         3        30       113      8.59       65%         0  claude claude-opus-5-5#high
        10         0         2        13        14      2.90       50%         8  codex gpt-6-astra#medium
         8         0         2         7        14      2.88       50%        15  opencode opencode-go/kimi-k3.1-pro#high
         7         0         0         1        11      1.71       14%         0  opencode opencode-go/kimi-k2.7-code#default
         6         0         3         2        13      3.00       33%        10  opencode opencode-go/deepseek-v4-pro#high
         3         0         0         2         7      3.00       67%         0  opencode opencode-go/qwen3.8-max#medium
```

The "By reviewer" section of `make findings ARGS="index"` likewise has 8 rows after the change, with `claude claude-opus-5-5#high` at 146 findings (136 and 10) and `opencode opencode-go/kimi-k2.7-code#default` at 12 (11 and 1).

## Independent review

The coordinator assigned reviewer A, Codex CLI (`gpt-6.1-sol`), for passes 1 and 3, and reviewer B, Claude Code (`claude-opus-5-5`, effort `high`), for pass 2. Each pass that runs to a report adds its section here and a line in `passes.jsonl`.

### Review pass 1

- **Reviewer:** A, Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, read-only sandbox, session `01a17f10-686f-7c82-9e3e-7c7c408c4366`; run by the coordinator.
- **Revision reviewed:** `b87abe75...20e90fd2`.
- **Invocation:** `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, with the prompt outside the worktree.
- **Model confirmation:** the model, reasoning effort, read-only sandbox, and session id in the output header, as the coordinator reported them.
- **Snapshot:** before and after the pass `d9d02468213ce27dcf71beebaef817271db331abaa5ed3d38a42ddb8aafc28cb`, identical.
- **Result:** Critical 0, High 0, Medium 2, Low 0, as in `passes.jsonl` line 1 and `findings.jsonl` lines 1 and 2. File lines are those of `20e90fd2`.
- **M1, contract-drift** (`scripts/reviewer-keys.ts:41`): the OpenCode model rule checked only that the model contains `/`, so `opencode-go/` passed both the schema and the canonical key rule. Fixed in `6412f287`: an OpenCode model must have a non-empty provider and a non-empty model around its first `/`, with the message `an OpenCode model is <provider>/<model>, both parts non-empty`; `design.md` D3 and D4 and the proposal say so. Tests: `an OpenCode model needs a non-empty provider and a non-empty model` (`test/reviewer-keys.test.ts`) and `validate rejects an OpenCode model with an empty part only in active changes` (`test/findings.test.ts`), which rejects the key in an active `findings.jsonl` and `passes.jsonl` and passes the same records in an archived change. Fail-before: with `scripts/reviewer-keys.ts` of `20e90fd2` and the new tests, the two files gave 33 tests, 31 pass, 2 fail, the two new tests; after the fix 33 of 33 pass. The category is `contract-drift`, because the code accepted what the spec's "Canonical reviewer key" excludes.
- **M2, contract-drift** (`docs/governance.md:45`): the same-harness fallback counted a reviewer of another harness as available without asking whether it may take the role, so an OpenCode reviewer barred from role B of a code task could block the fallback to another model of A's harness; the same gap was in `docs/agent-task-protocol.md:102`, `.claude/skills/taskelith-task-protocol/SKILL.md:15`, the living requirement "No reviewer of another harness", and the scenarios "Assigned reviewer fails to run" and "Unavailable reviewer at assignment" of "Unavailable reviewer", which the delta did not modify. Fixed in `6412f287`: governance "Unavailable reviewer" counts only reviewers allowed in the role under "Reviewer assignment" in its fallback; the protocol and the skill say the same for the proposed replacement and the fallback, pointing to governance; the delta modifies "Unavailable reviewer" (486 characters) and "No reviewer of another harness" (405 characters), keeping every scenario, rewording those two scenarios and the two of the fallback, and adding "Barred reviewer of another harness"; `design.md` D6 and the proposal name the change. `npm run openspec -- validate normalize-reviewer-keys --strict` and `npm run verify:archive` pass.
- These fixes go to reviewer B in pass 2, so their outcome is `fixed`.

`make verify` at `6412f287` (with `TMPDIR` on disk): exit 0. Tests: 2319, 2272 pass, 0 fail, 0 cancelled, 47 skipped (the same platform-bound skips). Coverage of all files: lines 99.28%, branches 92.34%, functions 98.94%. `validate --all --strict`: 70 passed, 0 failed. Every findings file is valid, 43 files; every pass summary file is valid, 23 files; every active OpenSpec change archives into strictly valid specs; 0 breaking changes in the four contract documents against `b87abe75`; 731 package paths verified, 41 with reviewed license coverage gaps; the comment, link, boundary, and package checks passed.

### Review pass 2

- **Reviewer:** B, Claude Code, model `claude-opus-5-5`, effort `high`, permission mode `plan`, editing tools disallowed, session `6915527b-b16b-438f-b2c9-812605f15292`; run by the coordinator.
- **Revision reviewed:** `b87abe75...f39870d1`.
- **Invocation:** `claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`.
- **Model confirmation:** `claude-opus-5-5` in the JSON `modelUsage`, as the coordinator reported it.
- **Snapshot:** before and after the pass `97bbde177a3a3119bb9c80c86503be353d4782d367c9535b96792bd53b862cbe`, identical.
- **Pass 1 fixes:** M1 confirmed fixed; M2 fixed except in coordinator step 1 of the protocol, which became L1.
- **Result:** Critical 0, High 0, Medium 0, Low 7, as in `passes.jsonl` line 2 and `findings.jsonl` lines 3 to 9. File lines are those of `f39870d1`. All seven are fixed in `a776a0fc` and are **unreviewed fixes** (`fixed-unreviewed`), because a Low-only pass ends the review (governance "Low findings are fixed").
- **L1, contract-drift** (`docs/agent-task-protocol.md:44`): coordinator step 1 skipped and replaced reviewers without the role test. Fixed, unreviewed: it skips a reviewer barred from the role by governance "Reviewer assignment", and the replacement must be one that may take the role.
- **L2, contract-drift** (`specs/review-process/spec.md:4`, protocol `:78`): neither said that both parts of an OpenCode model are non-empty. Fixed, unreviewed: both say `<provider>/<model>` with both parts non-empty, for OpenCode only, and the delta adds the scenario "OpenCode model with an empty part"; "Canonical reviewer key" is now 477 characters.
- **L3, evidence-mismatch** (`verification.md:44`): "both contract documents" where four are checked. Fixed, unreviewed: "the four contract documents".
- **L4, stale-citation** (`tasks.md:4`, `design.md:66`): the spec changes after pass 1 were missing. Fixed, unreviewed: task 1.2 and D6 list "Unavailable reviewer" and "No reviewer of another harness" and the new scenarios "Replacement from the rotation" and "Barred reviewer of another harness".
- **L5, evidence-mismatch** (`verification.md:108`): the scripts' coverage was called unmeasured. Fixed, unreviewed: measured and recorded under Limitations, `scripts/reviewer-keys.ts` 100/100/100, `scripts/findings.ts` lines 100%, branches 97.20%, functions 100%.
- **L6, spec-wording** (`specs/review-process/spec.md:23`, `:29-30`): "needs network access" beside "depends on external facts". Fixed, unreviewed: "Reviewer assignment" and its scenario tie network access to a review that depends on external facts. "Reviewer assignment" is now 424 characters.
- **L7** (`test/findings.test.ts:477`): the per-alias tests checked only `reviewers` and `index`. Fixed, unreviewed: each also asserts that `validate` exits 0 and that every archived `findings.jsonl` and `passes.jsonl` is byte-identical after `reviewers` and `index`. The vocabulary has no test category, so the finding is recorded as `contract-drift`: the tests did not guard the delta's "the archived file is not rewritten".

`make verify` at `a776a0fc` (with `TMPDIR` on disk): the first run exited 2 with one failure outside this change, `a provider that races two concurrent hand-offs fails the suite` (`packages/modules/workspace/test/workspace-conformance.test.ts:76`), which expected the probe `lets one of two concurrent hand-offs through where executions share a separate account` to be reported and got none; 2319 tests, 2271 pass, 1 fail, 47 skipped. This change touches neither that test nor the workspace module. Run alone three times, `node --experimental-strip-types --test packages/modules/workspace/test/workspace-conformance.test.ts` passed each time, 43 of 43, so the author records it as a timing flake under load, outside the change. The rerun of `make verify` exited 0: 2319 tests, 2272 pass, 0 fail, 0 cancelled, 47 skipped (the same platform-bound skips); coverage of all files lines 99.28%, branches 92.32%, functions 98.94%; `validate --all --strict` 70 passed, 0 failed; every findings file is valid, 43 files, and every pass summary file, 23 files; every active OpenSpec change archives into strictly valid specs; 0 breaking changes in the four contract documents against `b87abe75`; 731 package paths verified, 41 with reviewed license coverage gaps; the comment, link, boundary, and package checks passed.

### Review pass 3

Pass 2 found only Low findings, so no pass 3 ran to confirm its fixes, which are recorded as unreviewed (governance "Low findings are fixed"). Pass 3 ran instead as reviewer A's review of the merge of dev and its reconciliation, recorded under "Merge of dev" below.

## Merge of dev

On 2026-10-28 `origin/dev` was merged into the branch with a merge commit, done in a briefed subagent.

- **Base:** `b87abe75` (`git merge-base HEAD origin/dev` before the merge). **Dev revision merged:** `579c227d` (pull requests #366 and #368 to #372). **Merge commit:** `4ddc1494`. `package-lock.json` did not change, and no stale dependency inventory was reported.
- **Conflicts and resolutions:**
  - `.claude/skills/taskelith-coordinator/SKILL.md`: dev added the checklist's dev commit line, the exact invocation, the dev commit for `--save <change> --at <dev commit>`, and the task's size to the brief; this branch made the brief name reviewers A and B from governance "Reviewer assignment". Resolved with dev's sentence and this branch's reviewer clause.
  - `docs/agent-task-protocol.md`, coordinator step 1: the same two edits. Resolved with this branch's step (reviewers from "Reviewer assignment", the role test for skips and replacements) and dev's checklist additions (invocation, dev commit, size, "so that the worker can save it"). Worker step 2, "Checklist", "Checklist record", and "Checklist effect" of dev and this branch's worker step 5, "Validation", and "Legacy reviewer keys" merged without conflict.
  - `scripts/findings.ts`, `commandOutput`: dev moved the selection of archived changes into `runCommand` (`:382`), which now feeds `index`, `reviewers`, the tree's `checklist`, and `effect`, so this branch's `withCanonicalReviewers` moved there with it. Dev's `archiveSource` (`:412`), which reads the archive at a commit for `checklist --at`, also maps each finding through `withCanonicalReviewer`, so that every report reads archived records through `LEGACY_REVIEWER_ALIASES`, as the protocol's "Legacy reviewer keys" says. Dev's checklist and effect code reads no reviewer, so neither output changes; the mapping keeps the one-table rule uniform. This edit is in the merge commit.
  - `test/findings.test.ts` and `.claude/skills/taskelith-task-protocol/SKILL.md` merged without conflict. `docs/governance.md` is unchanged on dev since the base.
- **Delta reconciliation** (`git diff b87abe75 origin/dev -- openspec/specs/review-process/spec.md`): dev changed only "Findings index and checklist" (a scenario reworded and "Dev commit of the checklist" added) and added "Checklist record", "Checklist record validation", and "Checklist effect". None of the four requirements this delta modifies changed on dev, so their MODIFIED blocks stay as they are: "Authorized alternating reviewers", "Rotation order", "Unavailable reviewer", and "No reviewer of another harness". The ADDED names "Canonical reviewer key" and "Reviewer assignment" do not collide with dev's new requirements. Governance, the protocol, and the skills were searched for the turn assigning new tasks (`Rotation"`, "of different harnesses unless", "in turn"); only governance's own "Two alternating reviewers per task" and "Reviewer assignment" remain, which already state the assignment.
- **Checks** on the working tree of `4ddc1494` with Node.js 24.22.0 (`TMPDIR` on disk): `npm run openspec -- validate normalize-reviewer-keys --strict`: valid. `npm run openspec -- validate --all --strict`: 70 passed, 0 failed. `make verify`: exit 0 on the first run; tests 2364, 2317 pass, 0 fail, 0 cancelled, 47 skipped (the same platform-bound skips); coverage of all files lines 99.29%, branches 92.33%, functions 98.94%; every findings file is valid, 50 files, and every pass summary file, 30 files; every active OpenSpec change archives into strictly valid specs; 0 breaking changes in the four contract documents against `579c227d`; 731 package paths verified, 41 with reviewed license coverage gaps; the comment, link, boundary, and package checks passed. Measured apart, `test/findings.test.ts` and `test/reviewer-keys.test.ts`: 33 tests, 33 pass; `scripts/reviewer-keys.ts` 100/100/100; `scripts/findings.ts` lines 97.57%, branches 91.72%, functions 97.06%, the uncovered lines being dev's checklist and effect paths, which `test/checklist-*.test.ts` covers.
- **Reviewer statistics after the merge:** `make findings ARGS="reviewers"` still has one row per reviewer, 8 rows, now over 49 changes with review records and 112 passes (42 and 96 before), because dev archived more records; for example `codex gpt-6.1-sol#medium` 40 passes, 36 misses, and `claude claude-opus-5-5#high` 20 passes. The "By reviewer" section of `index` also has 8 rows. The governance statistics are the owner's of 2026-10-27 and are unchanged.
- **Evidence freshness:** the merge changes this change's implementation and records in the resolved parts (`scripts/findings.ts`, coordinator step 1 of the protocol, the coordinator skill), so the review evidence of passes 1 and 2 no longer covers them ([evidence freshness](/docs/governance.md#evidence-freshness)). Reviewer A reviewed the resolved diff and this reconciliation in review pass 3.
- **Review pass 3, the merge review:**
  - **Reviewer:** A, Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, read-only sandbox, session `01a17f6a-6494-72b2-8bc5-bd0e9cd306d6`; run by the coordinator.
  - **Scope:** the merge resolution of `4ddc1494`, the delta reconciliation against `579c227d`, and this "Merge of dev" record, at `1caf63b8`.
  - **Invocation:** `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, with the prompt outside the worktree.
  - **Model confirmation:** the model, reasoning effort, read-only sandbox, and session id in the output header, as the coordinator reported them.
  - **Snapshot:** before and after the pass `71f6bb812b9176c29b37f4148b5c8fd929c7d7deb328693a2fb4036d283ca716`, identical.
  - **Result:** no findings, Critical 0, High 0, Medium 0, Low 0, as in `passes.jsonl` line 3.
  - **Reviewer's limitation:** its sandbox blocked the findings tests and the comment checker (`EROFS`, `EPERM`), so it did not repeat `make verify` or the coverage independently; strict OpenSpec validation and findings validation passed for it, and `test/reviewer-keys.test.ts` 6 of 6.
- The file lines of "Author self-check" refer to `0968b548`; after the merge `checkChange` is at `scripts/findings.ts:314`, `reviewerProblems` at `:347`, and `withCanonicalReviewers` at `:354`.

## Second merge of dev

On 2026-10-28, after review pass 3, `origin/dev` `9b82cd9d` (pull requests #373 and #375) was merged into the branch with merge commit `3802a229`, base `579c227d`, without conflicts. It changed no living spec, script, or test and none of this change's requirements or contracts: only the Claude Code rows of the protocol's "Reviewer invocations" table, now `--output-format stream-json --verbose` as dev has them, `docs/foundation.md`, and `docs/g3-plan.md`. So it needs no delta reconciliation and no renewed review ([evidence freshness](/docs/governance.md#evidence-freshness)); only the checks are repeated, in the archive checks. Pass 2's recorded invocation with `--output-format json` is historical and stays.

## Archive

The change was archived on 2026-10-28 with `npm run openspec -- archive normalize-reviewer-keys --yes` (`review-process`: 2 added, 4 modified) after every task in `tasks.md` was ticked. The checks below ran on the resulting working tree, which is the tree of the archive commit `docs: archive the normalize reviewer keys change`, with Node.js 24.22.0 and `TMPDIR` on disk, after `git fetch` showed `origin/dev` still at `9b82cd9d`:

- `npm run openspec -- validate --all --strict`: 69 passed, 0 failed.
- `make verify`: exit 0. Tests 2364, 2317 pass, 0 fail, 0 cancelled, 47 skipped (the same platform-bound skips); coverage of all files lines 99.29%, branches 92.32%, functions 98.94%; every findings file is valid, 52 files, and every pass summary file, 32 files; every active OpenSpec change archives into strictly valid specs; 0 breaking changes in the four contract documents against `9b82cd9d`; 731 package paths verified, 41 with reviewed license coverage gaps; the comment, link, boundary, and package checks passed.
- `npm run openspec -- validate --archived --no-interactive`: this change's line is `✓ change/2026-10-28-normalize-reviewer-keys`.
- `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs` (merge base `9b82cd9d`): only `openspec/specs/review-process/spec.md`, 61 insertions and 15 deletions, which add "Canonical reviewer key" and "Reviewer assignment" and change "Authorized alternating reviewers", "Rotation order", "Unavailable reviewer", and "No reviewer of another harness"; dev's "Findings index and checklist", "Checklist record", "Checklist record validation", and "Checklist effect" are intact.
- The moved change has `findings.jsonl` with 9 findings and `passes.jsonl` with 3 passes; `make findings ARGS="validate"` passes.

## Limitations

- The rule checks the provider prefix of a model, not that the model exists (`design.md`, D3).
- Coverage: `make verify` measures coverage over the built `dist` files of the packages and apps, which leaves out the scripts under `scripts/`, because they run from source. Measured apart (review pass 2, L5), after the pass 2 fixes: `node --experimental-strip-types --test --experimental-test-coverage --test-coverage-include='scripts/reviewer-keys.ts' --test-coverage-include='scripts/findings.ts' test/findings.test.ts test/reviewer-keys.test.ts` gives 33 tests, 33 pass; `scripts/reviewer-keys.ts` lines 100%, branches 100%, functions 100%; `scripts/findings.ts` lines 100%, branches 97.20%, functions 100%.

## Remaining gates

- Integration into dev by the coordinator (single pull request).

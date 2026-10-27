# Verification

Date: 2026-10-27. The author's verification and `make verify` are recorded below, then review pass 1 by reviewer A, its fixes, and `make verify` after them; passes 2 and 3 have not run yet.

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
- `make verify` (with `TMPDIR` on disk): exit 0. Tests: 2317, 2270 pass, 0 fail, 0 cancelled, 47 skipped (the skips are the platform-bound tests that the suite names, such as the composed worker's crash windows that run natively on macOS and on Linux in `make verify-linux-crash-windows`). Coverage of all files: lines 99.28%, branches 92.30%, functions 98.94%. `validate --all --strict`: 70 passed, 0 failed. Every comment is within the comment length rule; every checked link conforms; every active OpenSpec change archives into strictly valid specs; workspace and hexagonal boundary checks passed; 0 breaking changes in both contract documents against `b87abe75`; 731 package paths verified, 41 with reviewed license coverage gaps; the package verification passed.

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

Not run yet: reviewer B, Claude Code (`claude-opus-5-5`, effort `high`), checks the pass 1 fixes and reviews the whole change.

### Review pass 3

Not run yet: reviewer A confirms the pass 2 fixes, if pass 2 has findings above Low.

## Limitations

- The rule checks the provider prefix of a model, not that the model exists (`design.md`, D3).
- Coverage: `make verify` measures coverage over the built `dist` files of the packages and apps; the scripts under `scripts/` run from source and are not in that measure. The new module's branches are each exercised by `test/reviewer-keys.test.ts` and `test/findings.test.ts`.

## Remaining gates

- Review pass 2 by reviewer B and, if it has findings above Low, pass 3 by reviewer A.
- Archive of the change on its branch.
- Integration into dev by the coordinator (single pull request).

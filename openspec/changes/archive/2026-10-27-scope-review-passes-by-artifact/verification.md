# Verification

Date: 2026-10-27. The author's verification and checks, `make verify` before review, review pass 1, and `make verify` after the pass 1 fix are recorded below.

## Scope and source

The coordinator, Niki, assigned this change on 2026-10-27 as a prerequisite of G3 item 0: the upcoming `revalidate-g3-foundations` change reviews seven artifacts, each by its own reviewers A and B with passes 1 to 3, and the review records keyed passes by number alone, so its second "pass 1" summary would fail validation. It was developed in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/scope-review-passes-by-artifact` on branch `scope-review-passes-by-artifact`.

- **Base revision:** `eda6c283` (`origin/dev`, merge of pull request #349).
- **Revision verified:** the author's checks below ran on the working tree of the records commit (`docs: add the scope-review-passes-by-artifact change`) on top of the tooling (`88a2f1cb`), the tests (`66b48eb5`), and the protocol section (`docs: describe the artifact key of review records`), the change commits `88a2f1cb..9db3f2d3`. `make verify` and review pass 1 ran on `c474a3a3`, the merge of `origin/dev` `af558eb0` into them. The pass 1 fix is `39f3dd6d`; its checks are listed under "Pass 1 fix".
- **Scope:** the optional `artifact` of the finding and pass schemas (`docs/review-findings/`), the keying by artifact and pass in `scripts/review-passes.ts` and `scripts/reviewer-statistics.ts`, the `MissedBy` and `Finding` types of `scripts/review-findings.ts`, their tests, `docs/agent-task-protocol.md` "Review findings record" (Format, Pass summaries, Missed findings, Validation), and the `review-process` delta.
- **Out of scope:** the `pass` maximum of 9, any rule that every line of a multi-artifact change names its artifact, the output formats of `index`, `reviewers`, and `checklist`, and other documents.

## Author self-check

- **Compatibility.** `artifact` is optional in both schemas, and `passName` renders a pass without an artifact as before (`pass 1`), so every existing record validates unchanged and the messages of single-artifact changes are identical; the existing tests pass unmodified.
- **One key.** Duplicate summaries, the finding-to-summary match, the counts, the `missedBy` lookup, and the statistics' miss attribution and derived passes all use `passKey` of `scripts/review-passes.ts`, so no rule keys a pass differently.
- **missedBy within the artifact.** The missed pass takes its artifact from the finding; a test shows that pass 1 of another artifact does not satisfy it.
- **Statistics.** Rows stay per reviewer and per role; a reviewer who makes pass 1 of two artifacts counts two passes, and a change without `passes.jsonl` derives one pass per distinct artifact and pass number of its findings.
- **Requirement length.** The modified requirements' bodies are 464 ("Review pass summaries"), 447 ("Pass summary consistency"), 357 ("Missed finding attribution"), and 467 ("Reviewer statistics") characters, under the pinned OpenSpec limit of 500, also after an archive in a scratch copy.
- New and changed comments are at most two lines of at most 80 characters.
- Commit types are `chore`, `test`, and `docs`; only repository tooling and documents change.

## Checks

Environment: macOS 26.6.2 (x86_64), Node.js 24.22.1 from `.nvmrc`, dependencies from `npm ci --ignore-scripts`. No Docker services were used.

- `npm run openspec -- validate scope-review-passes-by-artifact --strict`: valid.
- Scratch archive: `openspec archive scope-review-passes-by-artifact --yes` in a scratch copy of `openspec/`, then `openspec validate --specs --strict --no-interactive`: 69 passed, 0 failed.
- `node --experimental-strip-types --test --experimental-test-coverage` over `test/review-passes.test.ts`, `test/reviewer-statistics.test.ts`, `test/review-findings.test.ts`, and `test/findings.test.ts`, coverage limited to `scripts/findings.ts`, `scripts/review-findings.ts`, `scripts/review-passes.ts`, and `scripts/reviewer-statistics.ts`: 68 tests, 68 pass; lines 100%, branches 99.16%, functions 100% over those files, `review-passes.ts` and `reviewer-statistics.ts` 100% each.
- `npm run build` and `npx tsc -p tsconfig.check.json`: exit 0.
- `npm run verify:comments`: every comment is within the comment length rule.
- `npm run verify:findings`: every findings file is valid, 27 files; every pass summary file is valid, 7 files.
- `npm run verify:links`: every checked link conforms; 332 archived links remain in the baseline.
- `npm run verify:archive`: every active OpenSpec change archives into strictly valid specs.
- `make verify` on `c474a3a3`, before pass 1: exit 0; coverage of all files 99.29 % lines, 92.15 % branches, 99.01 % functions; `npm run openspec -- validate --all --strict --no-interactive` 70 passed, 0 failed; the links, archive, and package checks passed.

### Pass 1 fix

On `39f3dd6d`, without `make verify`:

- The four findings test files with coverage, as above: 69 tests, 69 pass; lines 100 %, branches 99.16 %, functions 100 % over the four scripts, `review-findings.ts` 100 % lines and 99.26 % branches.
- `npx tsc -p tsconfig.check.json`: exit 0.
- `npm run verify:comments`: every comment is within the comment length rule.

## Independent review

Reviewer A is Codex CLI, model `gpt-6.1-sol`, for passes 1 and 3, and reviewer B is OpenCode CLI, model `opencode-go/qwen3.8-max#medium`, for pass 2. Each pass that runs to a report adds its section here with its invocation, revision, model confirmation, session, snapshot, and findings, and a line in `passes.jsonl`.

### Review pass 1

Reviewer A: Codex CLI v0.164.0, model `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`, invoked as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>` on `c474a3a3`, with the prompt and log kept outside the worktree. The output header confirmed model `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`, and session `01a17dd2-11d5-78e2-94b8-a0f5833986fa`. The worktree snapshot was `d34fc091d1960fe4ebaa5464b1c562cf001ea1eeaf7fd3b7c2ca12d386c58150` both before and after the pass, so the reviewer changed nothing. Findings: Critical 0, High 0, Medium 0, Low 1, as in `passes.jsonl`.

- Low (contract-drift, `review-process`, `scripts/review-findings.ts` line 171): for a finding of artifact `y` in pass 2 with `missedBy` pass 2, role B, the order diagnostic read `missedBy pass 2 is not earlier than this finding's pass 2` without the artifact, although the protocol's "Validation" says messages name the artifact when there is one. Fixed, unreviewed, in `39f3dd6d`: the diagnostic renders the missed pass with `passName`, moved with `PassCoordinates` into `scripts/review-findings.ts` and re-exported by `scripts/review-passes.ts`, which imports from it, so no import cycle arises. It now reads `missedBy pass 2 of artifact "y" is not earlier than this finding's pass 2`, and is unchanged without an artifact; a test in `test/review-findings.test.ts` covers both.

The reviewer ran 47 tests and the comment and findings checks, which passed. Coverage was blocked by the read-only sandbox (`EPERM`), and it did not run `test/findings.test.ts`, which writes files.

A Low-only pass ends the review ([review process](/docs/governance.md#independent-review-process)), so the fix is unreviewed.

### Review pass 2

Not run: pass 1 was Low-only, so reviewer B is not used.

### Review pass 3

Not run: pass 1 was Low-only.

## Make verify after the pass 1 fix

`make verify` ran on `edea1619`, the merge of `origin/dev` `e4ea6077` (pull request #351, which touches no review-record file) into the change and its pass 1 fix and records: exit 0; coverage of all files 99.29 % lines, 92.15 % branches, 99.01 % functions; OpenSpec validation 70 passed, 0 failed; the link, archive, and package checks passed.

## Archive

The checked state is the tree of the archive commit, the working tree the checks ran on after `npm run openspec -- archive scope-review-passes-by-artifact --yes` on `edea1619` and the record of the post-fix `make verify`:

- `npm run openspec -- validate --all --strict`: 69 passed, 0 failed.
- `npm run openspec -- validate --archived --no-interactive`: this change's line `change/2026-10-27-scope-review-passes-by-artifact` passed.
- The spec diff against the merge base with `origin/dev` touches only `openspec/specs/review-process/spec.md`: the four modified requirements and their new scenarios.
- The moved change has `findings.jsonl` (1 finding) and `passes.jsonl` (1 pass); `make findings ARGS="validate"` passed: 29 findings files, 9 pass summary files.
- `make verify`: exit 0; coverage of all files 99.29 % lines, 92.14 % branches, 99.01 % functions; OpenSpec validation 69 passed, 0 failed.

## Remaining gates

- Integration into dev by the coordinator (single pull request).

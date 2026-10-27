# Verification

Date: 2026-10-27. The author's verification and checks are recorded below; `make verify` and the review passes are still to come.

## Scope and source

The coordinator, Niki, assigned this change on 2026-10-27 as a prerequisite of G3 item 0: the upcoming `revalidate-g3-foundations` change reviews seven artifacts, each by its own reviewers A and B with passes 1 to 3, and the review records keyed passes by number alone, so its second "pass 1" summary would fail validation. It was developed in a briefed subagent ([subagent execution](/docs/agent-task-protocol.md#subagent-execution)) in worktree `taskelith-worktrees/scope-review-passes-by-artifact` on branch `scope-review-passes-by-artifact`.

- **Base revision:** `eda6c283` (`origin/dev`, merge of pull request #349).
- **Revision verified:** the records commit (`docs: add the scope-review-passes-by-artifact change`) on top of the tooling (`88a2f1cb`), the tests (`66b48eb5`), and the protocol section (`docs: describe the artifact key of review records`). The checks ran on that working tree.
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

## Independent review

Reviewer A is Codex CLI, model `gpt-6.1-sol`, for passes 1 and 3, and reviewer B is OpenCode CLI, model `opencode-go/qwen3.8-max#medium`, for pass 2. Each pass that runs to a report adds its section here with its invocation, revision, model confirmation, session, snapshot, and findings, and a line in `passes.jsonl`.

### Review pass 1

Pending.

### Review pass 2

Pending.

### Review pass 3

Pending, if pass 2 has findings above Low.

## Remaining gates

- `make verify` on the working tree of the records commit.
- Review passes 1, 2, and, if needed, 3.
- Archive in the last commit of the branch, with its checks.
- Integration into dev by the coordinator (single pull request).

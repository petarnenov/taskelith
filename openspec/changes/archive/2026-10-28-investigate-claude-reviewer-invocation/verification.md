# Verification: investigate-claude-reviewer-invocation

## Scope and source

Assigned on 2026-10-27 by the coordinator to the worker session Maki. Source: the two failed Claude Code attempts of review pass 2 recorded in the archived change [`2026-10-27-stabilize-workspace-handoff-race-conformance`](/openspec/changes/archive/2026-10-27-stabilize-workspace-handoff-race-conformance/verification.md), which exited 1 with "Error: No messages returned from query" and empty output. Scope: find the cause and correct only the two Claude Code rows, `claude-fable-5-1` and `claude-opus-5-5`, of "Reviewer invocations" in `/docs/agent-task-protocol.md`, plus any other tracked file that documents that invocation. No requirement changes, so `.openspec.yaml` sets `skip_specs: true`. Commit type `docs`.

## Revision

Base `6b68d6c7` on `dev`. Prepared in the git worktree `../taskelith-worktrees/investigate-claude-reviewer-invocation` on branch `investigate-claude-reviewer-invocation`.

## Environment

Apple M3, macOS 26.6.2 (Darwin 25.6.0, arm64), Claude Code CLI 2.1.312 (native install; `npm view @anthropic-ai/claude-code version` also reports 2.1.312), Node.js v24.22.1. The user-level Claude Code settings allow Bash, Edit, Write, and NotebookEdit, set the default permission mode `auto`, and enable the plugin `next-steps`.

## Author self-check

- Against the brief: only the two Claude Code rows change; both keep `--permission-mode plan`, `--disallowedTools Edit Write NotebookEdit` after the prompt argument, the full model IDs, and `< /dev/null`, and redirect stdout to a log.
- Against the governance rule "Authorized reviewers": the model and effort stay in the invocation, and the result line's `modelUsage` confirms the model.
- Other files: `grep -rn "permission-mode plan" --include='*.md' .`, outside `node_modules` and archived changes, finds only the two rows; no file under `.claude/skills` contains `claude -p` or `--output-format json`. No other current operational instruction needed a change; archived records that quote the old invocation stay unchanged as history.
- Comments: the change adds no code comments.
- Evidence check: no external link. Repository links are root-relative and resolve, as `npm run verify:links` checks. The investigation's scripts and logs stayed in the session's scratch directory, outside the repository; `design.md` describes them.

## Investigation

See `design.md`: the cause in the CLI's headless output, the runs that isolate it, the excluded factors, what is unproven, and the recommended invocation. Each run compared the tree snapshot of the protocol before and after; all were unchanged. The proof of the recommended invocation is run 20: Opus 5.5 high, the 2.9 KB review prompt adapted to the merged change, in the main clone; exit 0 after 254 s, 20 turns, the result line with `subtype` `success`, `is_error` false, a `session_id`, and `modelUsage` naming only `claude-opus-5-5`. Edits blocked: with `--disallowedTools` the Write tool is absent (runs 13b and 14). About $7.25 at list prices over 23 investigation runs, plus four CLI invocations rejected during argument parsing before any model query.

## Checks

- `npm run openspec -- validate investigate-claude-reviewer-invocation --strict`: valid.
- `make verify`, started at a load average of 1.89 (1 minute): exit 0; 2,292 tests, 2,289 passed, 0 failed, 3 skipped; coverage 99.34 % lines, 92.28 % branches, 99.03 % functions; strict OpenSpec validation 70 passed, 0 failed; findings, links, contract compatibility, archive dry run, and package verification passed. It ran on the tree of `e38eb14d` before these results were written into this file, the only difference.

## Independent review

- **Pass 1, reviewer A: Codex CLI, model `gpt-6.1-sol`, reasoning effort `medium`, read-only sandbox, session `01a17f5c-de84-74e2-8ab9-dc4641a34ad4`, range `6b68d6c7..166ed0d7`.** Run by the coordinator. Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`. Model confirmation: the model, effort, and read-only sandbox are confirmed in the output header. The tree snapshot was identical before and after the pass. The reviewer confirmed both invocations: model, effort, plan mode, and the disallowed tools kept, the prompt before the variadic flag, and stdin closed; that run 20 shows `session_id` and `modelUsage` in the result line; that the trigger is labelled as inferred; that the Bash note is accurate; and that no other protocol row or section changed. Findings: 0 Critical, 0 High, 0 Medium, 2 Low.
  1. Low (`proposal.md:9`, `docs`): the proposal said no other file changes and no other tracked file documents the invocation, though the change adds its OpenSpec records and archived records, for example `/openspec/changes/archive/2026-10-25-plan-g2-work-items/verification.md`, quote the old invocation. Fixed in `05a5b6a2`, unreviewed: the proposal and the self-check say that only the two rows change outside the change's records, that no other current operational instruction needs an update, and that archived records stay unchanged.
  2. Low (`design.md:32`, `evidence-mismatch`): the design said four quoting errors never started the CLI, though their stderr shows the CLI's own `error: unknown option`. Fixed in `05a5b6a2`, unreviewed: `design.md` and this file count 23 investigation runs plus four CLI invocations rejected during argument parsing before any model query.
- **End of review.** Pass 1 found only Low findings, so under the governance rule "Low findings are fixed" they are fixed as unreviewed fixes and the review ends after pass 1; reviewer B, Claude Code `claude-opus-5-5` with effort `high`, was not used.

## Limitations

- No run caught the late message that displaces the `result`; the trigger, a `rate_limit_event` after the `result`, is inferred from the CLI code and the run evidence, not observed.
- `stream-json` makes the outcome independent of messages after the `result`, but a run that ends before its `result` still has no result line; the confirmation then fails visibly.
- Plan mode does not sandbox Bash; a reviewer can write outside the worktree, which the snapshot does not see.
- Measured on one host with CLI 2.1.312; another version may behave differently.

## Remaining gates

- Integration into dev by the coordinator (single pull request).

## Archive checks

Worker step 7, after review pass 1. Before archiving, `origin/dev` at `579c227d` was merged into the branch with the merge commit `f5db9b23`, without conflicts; `dev` had changed other paragraphs of `docs/agent-task-protocol.md`, not the two Claude Code rows. This change was opened before the checklist record rule, so it has no `checklist.json`. `make verify` on `f5db9b23`, started at a load average of 1.62 (1 minute), passed (exit 0): 2,334 tests, 2,331 passed, 0 failed, 3 skipped; coverage 99.34 % lines, 92.29 % branches, 99.03 % functions; strict OpenSpec validation 70 passed, 0 failed.

The checked state is the tree of the archive commit, which is the working tree these checks ran on after `npm run openspec -- archive investigate-claude-reviewer-invocation --yes` (base `f5db9b23`). The archive commit also points the findings' `file` at the moved records.

- `npm run openspec -- validate --all --strict`: 69 passed, 0 failed.
- `make verify`, started at a load average of 16.94 (1 minute): exit 0; 2,334 tests, 2,331 passed, 0 failed, 3 skipped; coverage 99.33 % lines, 92.26 % branches, 99.03 % functions; strict OpenSpec validation 69 passed, 0 failed; findings, links, contract compatibility, archive dry run, and package verification passed.
- `npm run openspec -- validate --archived --no-interactive`: the line of `change/2026-10-28-investigate-claude-reviewer-invocation` passes.
- `git diff "$(git merge-base HEAD origin/dev)" -- openspec/specs`: empty, as intended for a change with `skip_specs: true`.
- The moved change has its `findings.jsonl` with the two pass-1 lines and its `passes.jsonl` with the pass-1 line, and `make findings ARGS="validate"` passes.

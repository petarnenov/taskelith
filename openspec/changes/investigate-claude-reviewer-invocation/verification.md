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
- Other files: `grep -rn "permission-mode plan" --include='*.md' .`, outside `node_modules` and archived changes, finds only the two rows; no file under `.claude/skills` contains `claude -p` or `--output-format json`. No other file needed a change.
- Comments: the change adds no code comments.
- Evidence check: no external link. Repository links are root-relative and resolve, as `npm run verify:links` checks. The investigation's scripts and logs stayed in the session's scratch directory, outside the repository; `design.md` describes them.

## Investigation

See `design.md`: the cause in the CLI's headless output, the runs that isolate it, the excluded factors, what is unproven, and the recommended invocation. Each run compared the tree snapshot of the protocol before and after; all were unchanged. The proof of the recommended invocation is run 20: Opus 5.5 high, the 2.9 KB review prompt adapted to the merged change, in the main clone; exit 0 after 254 s, 20 turns, the result line with `subtype` `success`, `is_error` false, a `session_id`, and `modelUsage` naming only `claude-opus-5-5`. Edits blocked: with `--disallowedTools` the Write tool is absent (runs 13b and 14). About $7.25 at list prices over 23 CLI runs.

## Checks

- `npm run openspec -- validate investigate-claude-reviewer-invocation --strict`: valid.
- `make verify`, started at a load average of 1.89 (1 minute): exit 0; 2,292 tests, 2,289 passed, 0 failed, 3 skipped; coverage 99.34 % lines, 92.28 % branches, 99.03 % functions; strict OpenSpec validation 70 passed, 0 failed; findings, links, contract compatibility, archive dry run, and package verification passed. It ran on the working tree of the first commit, before these results were written into this file.

## Independent review

Not yet run.

## Limitations

- No run caught the late message that displaces the `result`; the trigger, a `rate_limit_event` after the `result`, is inferred from the CLI code and the run evidence, not observed.
- `stream-json` makes the outcome independent of messages after the `result`, but a run that ends before its `result` still has no result line; the confirmation then fails visibly.
- Plan mode does not sandbox Bash; a reviewer can write outside the worktree, which the snapshot does not see.
- Measured on one host with CLI 2.1.312; another version may behave differently.

## Remaining gates

- Independent review (reviewers A and B as assigned).
- Archive after the review.
- Integration into dev by the coordinator (single pull request).

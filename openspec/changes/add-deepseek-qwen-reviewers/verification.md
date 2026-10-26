# Verification: add-deepseek-qwen-reviewers

## Scope and source

On 2026-10-26 the owner approved two more OpenCode reviewers: `opencode-go/deepseek-v4-pro` with the `high` variant and `opencode-go/qwen3.8-max` with the `medium` variant (first named as `xhigh`, corrected by the owner to `medium` the same day). The owner also said that with so many OpenCode reviewers the non-adjacency condition may not always hold. The coordinator (Niki) gave the circular list order and assigned the task; its implementation subagent made the change. Base revision: `843e293d` on `dev`. Prepared in the git worktree `../taskelith-worktrees/add-deepseek-qwen-reviewers` on the branch `add-deepseek-qwen-reviewers`.

## Environment

macOS (Darwin 25.6.0), Node.js v24.22.1, OpenCode CLI with the OpenCode Go provider.

## Requirements

- The authorized reviewers, in order: Codex CLI (gpt-6.1-sol), OpenCode CLI (kimi-k3.1-pro), Antigravity CLI, OpenCode CLI (deepseek-v4-pro), Claude Code (claude-fable-5-1), OpenCode CLI (kimi-k2.7-code), Codex CLI (gpt-6-astra), OpenCode CLI (qwen3.8-max), Claude Code (claude-opus-5-5); the turn returns to the first after the last, and no two neighbours share a harness, including at the wrap.
- OpenCode CLI (deepseek-v4-pro): `opencode-go/deepseek-v4-pro#high`, the existing `reviewer` agent.
- OpenCode CLI (qwen3.8-max): `opencode-go/qwen3.8-max#medium`, the existing `reviewer` agent.
- The owner's statement is recorded: the non-adjacency rule binds the list, and a skipped reviewer may leave two reviewers of the same harness next to each other in the effective turn.
- The invocation table has a row per new reviewer, naming its variant and referring to the OpenCode CLI (kimi-k3.1-pro) row, in the list order.

## Author self-check

- Only the reviewer list, the Rotation rule, the invocation table, and one scenario change; the one-reviewer rule, the pass cap, the unavailability window, and the pauses are unchanged.
- Adjacency checked by hand over the nine positions and the wrap: harnesses Codex, OpenCode, Antigravity, OpenCode, Claude Code, OpenCode, Codex, OpenCode, Claude Code, then Codex; no two neighbours match.
- The governance list, the Rotation turn, the invocation table, the design, and this record name the same reviewers in the same order.
- `git grep -n kimi -- ':!openspec/changes/archive' ':!openspec/changes/add-deepseek-qwen-reviewers'` finds only `docs/governance.md` and `docs/agent-task-protocol.md`; `.claude/skills/taskelith-task-protocol/SKILL.md` names no reviewer and is unchanged. `AGENTS.md` names no reviewer.
- The modified requirement text is copied unchanged (450 characters); only a fourth scenario is added.
- The evidence check has nothing to verify: no external link is added. All content is English.

## Smoke tests of the new invocations

Run on 2026-10-26 from the worktree at `843e293d`, before any edit, with the prompt "Read README.md and reply with its first heading only. Do not edit anything." and the documented invocation (`--title add-deepseek-qwen-reviewers`, `< /dev/null`, JSON events to a log outside the worktree), each under a 600-second alarm.

- **OpenCode CLI (deepseek-v4-pro).** `opencode run --standalone --agent reviewer -m 'opencode-go/deepseek-v4-pro#high' --format json ...`, 21:25:50Z to 21:25:56Z UTC: exit code 0, `sessionID` `ses_e85e502b7ffemwQlAKOg7Z0tKI`, reply `# Taskelith` after one read tool call. The stored assistant messages in `~/.local/share/opencode/opencode.db` (table `session_message`; the standalone sessions are stored there) record `"model":{"id":"deepseek-v4-pro","providerID":"opencode-go","variant":"high"}`. The step reported 17 reasoning tokens.
- **OpenCode CLI (qwen3.8-max).** `opencode run --standalone --agent reviewer -m 'opencode-go/qwen3.8-max#medium' --format json ...`, 21:25:56Z to 21:26:04Z UTC: exit code 0, `sessionID` `ses_e85e4eb5fffeg72VG6HuHX4n1w`, reply `# Taskelith` after one read tool call. The stored assistant messages record `"model":{"id":"qwen3.8-max","providerID":"opencode-go","variant":"medium"}`. OpenCode did not reject the variant: its model cache (`~/.cache/opencode/models.json`) lists effort values `low`, `medium`, and `xhigh` for `qwen3.8-max`, and `high` and `max` for `deepseek-v4-pro`.
- Snapshots: `git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256` gave `6af69f18b66f8687aaeaaa3ba3d0b897cf0b2389bfa59b8004ce6ce7b309d1e0` before and after each run; the tree was unchanged.

An earlier attempt the same minute wrapped the runs in `timeout`, which macOS lacks, so neither CLI was started; the runs above used a `perl` alarm instead.

## Checks

Node v24.22.1, in the worktree:

- `npm run openspec -- validate add-deepseek-qwen-reviewers --strict`: `Change 'add-deepseek-qwen-reviewers' is valid`.
- `make verify` before review pass 1: passed; tests 1923, pass 1921, fail 0, skipped 2; coverage of all files 99.29% lines, 92.11% branches, 99.04% functions; OpenSpec 70 passed, 0 failed; the archive dry run and the package check passed.

## Independent review

Reviewer assigned by the coordinator: Codex CLI (gpt-6.1-sol), run by the worker's implementation subagent from the worktree.

- **Pass 1** on 3fe3175b, 2026-10-26: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, session `01a17a23-1922-7fa1-8577-b604fa15ba13`; the output header confirmed model `gpt-6.1-sol`, sandbox `read-only`, and reasoning effort `medium`. The SHA-256 snapshots before and after the pass were identical (`194963612b8fb112eee64fe8e35c47f567ea022c84eb3f365efa5568e62246be`). The reviewer found the names and order consistent, no adjacent same-harness reviewers including the wrap, the requirement and its three scenarios copied unchanged, and the two DeepSeek models clearly distinguished. Findings: Critical 0, High 0, Medium 0, Low 1.
  - Low: the self-check said that `git grep kimi` outside the archive finds only the two documents, which is untrue at 3fe3175b because this change's `design.md` and `verification.md` also match. Fixed (unreviewed fix) by recording the exact command, which also excludes this change's directory.
- The pass had only a Low finding, so it was fixed without another review, as the governance policy allows.

## Remaining gates

Integration into dev by the coordinator (single pull request). Promotion to `main` is a separate owner decision.

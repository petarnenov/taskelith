## Context

On 2026-10-26 the owner approved two more OpenCode reviewers, `opencode-go/deepseek-v4-pro#high` and `opencode-go/qwen3.8-max#medium` (the owner first named `#xhigh` for Qwen and corrected it to `#medium` the same day). The owner also said that with so many OpenCode reviewers the non-adjacency condition may not always hold. The coordinator gave the list order below.

## Decisions

- **List order.** Codex CLI (gpt-6.1-sol), OpenCode CLI (kimi-k3.1-pro), Antigravity CLI, OpenCode CLI (deepseek-v4-pro), Claude Code (claude-fable-5-1), OpenCode CLI (kimi-k2.7-code), Codex CLI (gpt-6-astra), OpenCode CLI (qwen3.8-max), Claude Code (claude-opus-5-5), then Codex CLI (gpt-6.1-sol) again. The four OpenCode reviewers sit at positions 2, 4, 6, and 8, the Codex pair at 1 and 7, and the Claude Code pair at 5 and 9; position 9 is followed by 1, so no two neighbours, including the wrap, share a harness.
- **The rule binds the list.** The non-adjacency requirement stays unchanged. Skipping a paused or unavailable reviewer, for example Antigravity CLI, which is paused until about 2026-10-31, makes OpenCode CLI (kimi-k3.1-pro) and OpenCode CLI (deepseek-v4-pro) consecutive in the effective turn. The owner accepted this on 2026-10-26, so it is recorded as a scenario rather than as a new requirement sentence, which keeps the requirement under the length that the pinned OpenSpec accepts after archive.
- **The new invocation rows refer to the OpenCode CLI (kimi-k3.1-pro) row.** The shared notes are not repeated, so they cannot drift apart; each row names its variant.
- **The DeepSeek wording.** The OpenCode CLI (kimi-k3.1-pro) entry names `opencode-go/deepseek-v4.1-flash` as its earlier configuration. The new entry names it as a different model, so a reader does not take the new reviewer for that earlier configuration.
- **No configuration change.** `-m` selects the model and variant per run.

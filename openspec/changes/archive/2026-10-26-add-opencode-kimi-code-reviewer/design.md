## Context

On 2026-10-26 the owner said, in Bulgarian and paraphrased here: add one more reviewer, OpenCode, with the same settings as the away delegate, kimi-k2.7-code, put it into the reviewer-selection rotation, but the two OpenCode reviewers must not be next to each other. The away delegate runs `opencode-go/kimi-k2.7-code` without a variant, so the default variant applies.

The same day the owner also approved a second Codex reviewer, `gpt-6-astra` with effort `medium` and sandbox `read-only`, and a second Claude Code reviewer, `claude-opus-5-5` with effort `high`, permission mode `plan`, and editing tools disallowed. The coordinator added them to this change and gave the list order below.

## Decisions

- **List order.** The rotation follows the list order and wraps from the last entry to the first: Codex CLI (gpt-6.1-sol), Antigravity CLI, OpenCode CLI (kimi-k3.1-pro), Claude Code (claude-fable-5-1), Codex CLI (gpt-6-astra), OpenCode CLI (kimi-k2.7-code), Claude Code (claude-opus-5-5), then Codex CLI (gpt-6.1-sol) again. Each pair of same-harness reviewers has other reviewers between them in both directions: the Codex pair at positions 1 and 5, the OpenCode pair at 3 and 6, and the Claude Code pair at 4 and 7, with 7 followed by 1.
- **The non-adjacency rule is general.** It is stated for reviewers of the same harness, so a future reordering or a further reviewer of an existing harness keeps them apart. The spec states it as part of "Rotation order", because the list order defines the turn.
- **Each entry is a separate reviewer.** The one-reviewer, rotation, unavailable, and pause rules address each entry on its own, so every harness with several entries has them named by their models. This is the coordinator's reading of the existing rules, attributed as such.
- **The new invocation rows refer to the existing rows of their harness.** The shared notes are not repeated, so they cannot drift apart.
- **No configuration change.** The new OpenCode reviewer uses the existing `reviewer` agent in the user's OpenCode configuration; `-m` selects the model per run.

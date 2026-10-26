# Add three reviewers and keep same-harness reviewers apart

## Why

On 2026-10-26 the owner asked to add one more OpenCode reviewer, with the same settings as the owner's away delegate, `opencode-go/kimi-k2.7-code`, to put it into the reviewer rotation, and to keep the two OpenCode reviewers from being next to each other. The same day the owner also approved a second Codex reviewer, `gpt-6-astra`, and a second Claude Code reviewer, `claude-opus-5-5`. This change adds all three.

## What Changes

- `docs/governance.md`:
  - add OpenCode CLI (kimi-k2.7-code): model `opencode-go/kimi-k2.7-code` through the OpenCode Go provider, its default variant, and the existing `reviewer` agent;
  - add Codex CLI (gpt-6-astra): model `gpt-6-astra`, `model_reasoning_effort = "medium"`, sandbox `read-only`;
  - add Claude Code (claude-opus-5-5): model `claude-opus-5-5`, effort `high`, permission mode `plan`, editing tools disallowed;
  - name the existing entries by their models, Codex CLI (gpt-6.1-sol), OpenCode CLI (kimi-k3.1-pro), and Claude Code (claude-fable-5-1), and state that each entry is a separate reviewer for the review rules;
  - order the list so that no two reviewers of the same harness are adjacent, including at the wrap, state that owner rule, and spell out the resulting turn.
- `docs/agent-task-protocol.md`: add the three new invocations in the list order, and name the existing rows by their models.
- `.claude/skills/taskelith-task-protocol/SKILL.md`: the pointer to the invocations says that a harness may have several reviewers.

## Capabilities

### New Capabilities

### Modified Capabilities

- `review-process`: "Rotation order" adds the rule that reviewers of the same harness are not adjacent in the list.

## Impact

Documentation, the project skill, and the specification only. No product behavior changes. The user's OpenCode configuration is not changed: the new OpenCode reviewer uses the existing `reviewer` agent.

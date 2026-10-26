# Add the DeepSeek and Qwen OpenCode reviewers

## Why

On 2026-10-26 the owner asked to add two more OpenCode reviewers to the reviewer pipeline: `opencode-go/deepseek-v4-pro` with the `high` variant and `opencode-go/qwen3.8-max` with the `medium` variant. The owner also said that with so many OpenCode reviewers the non-adjacency condition may not always hold in practice.

## What Changes

- `docs/governance.md`:
  - add OpenCode CLI (deepseek-v4-pro) and OpenCode CLI (qwen3.8-max), both with the existing `reviewer` agent;
  - reorder the authorized reviewer list into the coordinator's circular order of nine reviewers, which keeps every same-harness pair apart, including from the last back to the first;
  - spell out the new turn in the Rotation rule, and record the owner's statement that the non-adjacency rule binds the list, so that a skipped reviewer may leave two reviewers of the same harness next to each other in the effective turn.
- `docs/agent-task-protocol.md`: add the two invocation rows and order the table like the list.
- `review-process`: "Rotation order" gains a scenario for a skipped reviewer between two reviewers of the same harness.

## Capabilities

### New Capabilities

### Modified Capabilities

- `review-process`: "Rotation order" adds the scenario "Same harness after a skipped reviewer".

## Impact

Documentation and the specification only. No product behavior changes. The user's OpenCode configuration is not changed: the new reviewers use the existing `reviewer` agent.

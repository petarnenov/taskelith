## Why

On 2026-10-25 the owner asked to run OpenCode reviews with `opencode/deepseek-v4.1-flash` again, instead of `opencode/kimi-k3`.

## What Changes

- `docs/governance.md`: the OpenCode reviewer's model becomes `opencode/deepseek-v4.1-flash` with the `high` variant.
- `docs/agent-task-protocol.md`: the invocation passes `-m 'opencode/deepseek-v4.1-flash#high'`.

No spec delta: the `review-process` requirements do not name a model, and the change is documentation only.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

Documentation only. No product behavior changes.

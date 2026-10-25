## Why

On 2026-10-26 the owner set the OpenCode reviewer model to `opencode-go/kimi-k3.1-pro`, replacing `opencode-go/deepseek-v4.1-flash` with the `high` variant, and asked for the change to be recorded directly, without an independent review.

## What Changes

- `docs/governance.md`: the OpenCode reviewer's model becomes `opencode-go/kimi-k3.1-pro`, with its default variant.
- `docs/agent-task-protocol.md`: the invocation passes `-m 'opencode-go/kimi-k3.1-pro'`, and the note says `-m` is required.

No spec delta: the `review-process` requirements do not name a model, and the change is documentation only.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

Documentation only. No product behavior changes.

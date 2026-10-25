## Why

On one worker host, the OpenCode configuration now allows only the OpenCode Go provider, so the authorized reviewer model `opencode/deepseek-v4.1-flash` is refused there, while `opencode-go/deepseek-v4.1-flash` is available. On 2026-10-26 the owner approved `opencode-go/deepseek-v4.1-flash` with the `high` variant and then made it the correct OpenCode configuration, replacing `opencode/deepseek-v4.1-flash`. A review on the coordinator's host failed the same night with `provider.no-route: Model unavailable: opencode/deepseek-v4.1-flash`.

## What Changes

- `docs/governance.md`: the OpenCode reviewer's model becomes `opencode-go/deepseek-v4.1-flash` with the `high` variant.
- `docs/agent-task-protocol.md`: the invocation passes `-m 'opencode-go/deepseek-v4.1-flash#high'`.

No spec delta: the `review-process` requirements do not name a model, and the change is documentation only.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

Documentation only. No product behavior changes.

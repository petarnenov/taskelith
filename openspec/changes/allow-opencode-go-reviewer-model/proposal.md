## Why

On one worker host, the OpenCode configuration now allows only the OpenCode Go provider, so the authorized reviewer model `opencode/deepseek-v4.1-flash` is refused there, while `opencode-go/deepseek-v4.1-flash` is available. On 2026-10-26 the owner approved `opencode-go/deepseek-v4.1-flash` with the `high` variant as an authorized OpenCode reviewer model.

## What Changes

- `docs/governance.md`: the OpenCode reviewer may use `opencode-go/deepseek-v4.1-flash` with the `high` variant where a host's configuration allows only that provider.
- `docs/agent-task-protocol.md`: the OpenCode invocation row names that `-m` value for such hosts.

No spec delta: the `review-process` requirements do not name a model, and the change is documentation only.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

Documentation only. No product behavior changes.

## Context

The reviewer model is part of the reviewer's authorization in the governance policy, so a different model identifier needs the owner's approval and a record, even when it is the same model through another provider.

## Decisions

- Add the OpenCode Go identifier as an alternative, not a replacement: hosts that reach `opencode/deepseek-v4.1-flash` keep using it.
- Keep the `high` variant and every other rule of the OpenCode invocation unchanged.

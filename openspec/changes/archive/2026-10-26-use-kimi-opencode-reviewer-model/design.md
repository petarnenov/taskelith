## Context

The reviewer model is part of the reviewer's authorization in the governance policy, so the owner's choice is recorded there and in the invocation.

## Decisions

- Replace the identifier in the two places that name it, keeping every other OpenCode rule.
- State that `-m` is required, because a run without it falls back to the global default model and has hung.

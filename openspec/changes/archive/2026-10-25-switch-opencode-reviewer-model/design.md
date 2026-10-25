## Context

The OpenCode reviewer invocation names its model in two places: the governance list of authorized reviewers and the protocol's reviewer invocations.

## Decisions

- **`#high` in the invocation.** A ping without a variant recorded the variant `default`. A ping with `#high` recorded the variant `high`. So the variant is passed in `-m`, as the governance rule requires model and effort to be set in the invocation.
- **No runtime change.** Only documentation changes. The `reviewer` agent configuration is unchanged.

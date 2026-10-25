## Context

Merged history on `dev` cannot be rewritten. The protocol's integration step recommits a wrongly typed commit on a new branch instead of rewriting a pushed one.

## Decisions

- Revert and re-apply instead of rewriting history: never force push, and `main` analysis sees both commits.
- The revert keeps the archived OpenSpec records of `fix-boundary-entrypoint`, because they record what happened, and reverting them would only be restored again.
- The re-applied commit is `chore`, the type for repository tooling.

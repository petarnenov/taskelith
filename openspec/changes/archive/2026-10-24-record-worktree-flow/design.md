## Context

The integration flow sends feature branches into `dev` and promotes `dev` to `main`. Working on branches in one clone serializes changes; git worktrees give each change its own working directory on a shared repository.

## Goals / Non-Goals

Record the owner's rule and the practical steps. Do not add tooling, `make` targets, or CI changes.

## Decisions

- Keep the main clone on `dev`; create each worktree outside it, from `origin/dev`, with `--no-track` so the branch does not track `dev`, and push with `git push -u origin <change>`. These are documented as guidance, not as normative requirements.
- Run `npm ci --ignore-scripts` per worktree, because `node_modules` is not shared.
- Rely on the shared `core.hooksPath` so the `make verify` gate applies in every worktree.
- Remove the worktree and its local branch after the pull request is merged (guidance).

## Risks / Trade-offs

Parallel changes can conflict when they touch the same documents; the second merge must be rebased onto the updated `dev`. Each worktree costs a full `node_modules` install.

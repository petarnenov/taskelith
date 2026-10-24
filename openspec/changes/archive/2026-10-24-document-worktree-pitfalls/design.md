## Context

`docs/releases.md` describes developing each change in its own worktree and cleaning up after the merge. The `.githooks/pre-push` hook is `exec make verify`; it does not inspect what is being pushed, and `make verify` starts with the Node and npm toolchain check.

## Goals / Non-Goals

Record the two observed pitfalls and their workarounds. Do not change the hook, the `Makefile`, or the merge tooling, and do not add a rule for when remote branches are deleted.

## Decisions

- Explain the `gh` behaviour by its cause in gh 2.88.1 (`pkg/cmd/pr/merge/merge.go`): local branch deletion runs before remote deletion and first switches to the base branch; the switch fails because `dev` is checked out in the main clone, and the error ends the command.
- Document the `gh pr merge --delete-branch` behaviour as guidance in `docs/releases.md` only. It is a property of the `gh` CLI, not a Taskelith requirement, so the specification does not state it.
- Record the deletion-push behaviour as a scenario of the existing "Local gate before push" requirement, because it follows from that requirement: the hook gates every push. The requirement text is unchanged.
- Confirm the merge before deleting the remote branch, matching the existing cleanup order (update `dev`, then remove the worktree and branch).

## Risks / Trade-offs

A later `gh` release may delete the remote branch even from a worktree; the guidance then becomes unnecessary but stays harmless, because deleting an already deleted branch fails visibly.

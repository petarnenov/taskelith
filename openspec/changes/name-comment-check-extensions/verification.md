# Verification: name-comment-check-extensions

Date: 2026-10-25.

Status: draft before independent review.

## Scope and source

The coordinator assigned this change on 2026-10-25 as the follow-up to Low finding 5 of the review of the archived change `align-comment-rule-text`. Base revision: `2545d26` on `dev`. Scope: the `engineering-principles` requirement "Comment length scope", the comment rule in `AGENTS.md`, and this change. Prepared in a git worktree.

## Author self-check before review

- The file kinds named in the delta and in `AGENTS.md` are those of `SLASH_EXTENSIONS`, `HASH_EXTENSIONS`, `HASH_BASENAMES`, and the shebang test of `commentSyntax` in `scripts/check-comment-length.ts`.
- The delta carries over the whole requirement, its text and all four scenarios, and changes only the file-kind list. The requirement text is 472 characters.
- Worker step 3 of `docs/agent-task-protocol.md` lists no file kinds and points to `AGENTS.md`, so it is unchanged.
- Evidence check: the change adds no link.

## Checks

Pending.

## Independent review

Pending.

## Limitations

Pending.

## Remaining gates

Independent review, then merge into `dev` and archive by the coordinator.

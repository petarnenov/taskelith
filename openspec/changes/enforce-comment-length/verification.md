# Verification: enforce-comment-length

## Scope and source

On 2026-10-25 the owner approved the task `enforce-comment-length`; the coordinator (Niki) assigned it to Pepi with this scope: shorten every existing comment that breaks the comment rule of `AGENTS.md` in the tracked files within its scope, without behaviour changes; add a check to `make verify` that names the file, the line, and the reason, with unit tests for its pure parts; and update the `engineering-principles` requirements where they leave the rule unchecked. Base revision: `d113b6a` on `dev`. Prepared in a git worktree.

## Self-check

- The check found 124 violations at `d113b6a`: 42 in the SpecKit fixture scaffold copy, now exempt as a copy of the capture, and 82 in 39 authored files, now 0. The design records the counting rules.
- A comment line of 93 characters appended to `scripts/setup.ts` made the check exit 1 with `scripts/setup.ts:32: comment line is 93 characters (max 80)`; the line was then removed.
- Every changed comment keeps its contract or rationale; the diff of the 38 comment-only files changes only comment lines.
- `docs/dependencies/licenses.json` changes only in its provenance digests of `package.json` and `scripts/dependency-inventory.ts`, regenerated with `npm run inventory:dependencies`.
- Evidence check: the change adds no external link.
- Requirements stay under 500 characters (250, 420, and 181).

## Checks

Node v24.22.1, npm 12.2.1, in the worktree: `make verify` passed at `4eb1d49` (278 tests, 99.62% lines, 95.68% branches, 99.27% functions), including `npm run verify:comments` and the archive dry run; `npm run openspec -- validate enforce-comment-length --strict` passed.

## Independent review

Assigned reviewer (rotation): Claude Code with `claude-fable-5-1`, effort medium, permission mode `plan`, editing tools disallowed.

## Remaining gates

Independent review, then merge into `dev` and archive by the coordinator.

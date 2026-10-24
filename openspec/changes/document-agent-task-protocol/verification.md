# Verification: document-agent-task-protocol

Date: 2026-10-24.

## Scope and source

The owner asked on 2026-10-24 for the agent task protocol to be recorded so that it is not lost between sessions, possibly as a skill. The coordinating session (Niki) proposed a repository document linked from `AGENTS.md` plus a pointer skill, and made the change. The rules recorded come from the owner's instructions the same day: delegate parallel tasks to the worker sessions, follow the merge protocol for finished tasks without a separate approval, keep `dev` synchronized, tell workers to clear their context after a merge, give UI tasks to the session holding the UI proof of concept, and send that session the protocol. Base revision: `1b9c183` on `dev`. Scope: `docs/agent-task-protocol.md`, `.claude/skills/taskelith-task-protocol/SKILL.md`, one line in `AGENTS.md`, and this change.

## Author self-check before review

- The protocol grants no authority: it records the owner's authorizations of 2026-10-24 and defers to `docs/governance.md` and `docs/releases.md`.
- Every rule that governance or releases already hold is linked, not restated: review rules, worktree commands, and branch cleanup.
- The reviewer invocations match those recorded in archived `verification.md` files: Codex (`2026-10-24-align-contract-decision-status`), Antigravity (`2026-10-24-select-contract-and-schema-tooling`), and Claude Code (`2026-10-24-capture-speckit-native-artifacts`).
- Evidence check: the change adds no external link. The internal links point to existing files and headings (`governance.md#authority`, `governance.md#independent-review-process`, `releases.md#parallel-work-with-worktrees`, and the archived SpecKit capture record).
- All content is English, and the npm package is unchanged (`.claude/` and `docs/agent-task-protocol.md` are not in `files`).

## Checks

Node v24.22.1, npm 12.2.1, in the worktree: `npm run openspec -- validate document-agent-task-protocol --strict` passed, and `make verify` passed (tests with coverage, boundary and coverage-scope checks, dependency inventory, strict OpenSpec validation, package verification).

## Independent review

Assigned reviewer (rotation): Antigravity CLI with `agy -p <prompt> --model gemini-4-argon-medium --effort medium --mode plan --output-format json --log-file <log>`, run from the worktree.

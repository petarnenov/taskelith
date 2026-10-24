## Context

Several agent sessions develop Taskelith in parallel on two machines and in different harnesses. The governance policy already defines the review rules, and the release flow already defines worktrees. What was missing is how sessions divide and hand off work, and who integrates it.

## Goals / Non-Goals

Goals: one harness-neutral source of truth, reachable by every session through git, and a quick entry point for Claude Code sessions. Non-goals: changing the review process, the release flow, or integration authority. The page records the owner's existing authorizations; it grants none.

## Decisions

- Keep the protocol in `docs/` and link it from `AGENTS.md`, because every harness reads `AGENTS.md` and git carries both to the other machine. A user-level skill would reach only one machine.
- Make the Claude Code skill a pointer to the document, not a copy, so that the two cannot drift apart.
- Name roles, not sessions. Session names change, and the protocol stays valid whichever session holds a role.
- Point to governance and releases for the rules they already hold, and state that they win on any difference.

## Risks / Trade-offs

Reviewer invocations depend on CLI versions and local configuration, and can go stale; a CLI change updates the table through its own change. The skill works only in Claude Code. Other harnesses reach the protocol through `AGENTS.md`.

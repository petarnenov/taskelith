## Context

The owner's instruction was short: tasks run in a subagent, with OpenCode review. Under the away mode the owner had activated, the coordinator settled its reading through the away delegate (OpenCode, `opencode-go/kimi-k2.7-code`, run `20261026T011448Z-opencode-58558`).

## Decisions

1. **What runs in the subagent.** The worktree work (code, tests, documentation, OpenSpec artifacts) runs in a subagent the session briefs; the session checks the result. Messages, owner questions, the review, and the handoff stay in the session, because only the session is addressable by the coordinator and the owner.
2. **Reviewer.** OpenCode CLI is the reviewer of every task, and the rotation is suspended. The rotation stays to choose a replacement when OpenCode is unavailable or the worker's host has no OpenCode CLI, so that the unavailable-reviewer rule still has an order to follow.
3. **Start.** The rule applies to tasks assigned from 2026-10-26 on. A task assigned earlier keeps its reviewer, because switching mid-review would restart its passes.

## Risks

A subagent knows only its brief, so the session checking its result is part of the rule. The one-reviewer and three-pass rules are unchanged.

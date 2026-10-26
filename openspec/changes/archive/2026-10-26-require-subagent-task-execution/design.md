## Context

The owner's instruction was short: a task runs in a subagent. The owner first said "with OpenCode review" and then clarified that it meant the reviewer of this rule change, not a new reviewer rule. Under the away mode the owner had activated, the coordinator first settled the reading through the away delegate (OpenCode, `opencode-go/kimi-k2.7-code`, run `20261026T011448Z-opencode-58558`), which read it as a mandatory OpenCode reviewer; the owner's clarification replaced that reading.

## Decisions

1. **What runs in the subagent.** The worktree work (code, tests, documentation, OpenSpec artifacts) runs in a subagent the session briefs; the session checks the result. Messages, owner questions, the review, and the handoff stay in the session, because only the session is addressable by the coordinator and the owner. The subagent may record the review results the session provides in `verification.md`; the session checks the record.
2. **Start.** The rule applies to tasks assigned from 2026-10-26 on, so that tasks in progress are not restarted.

## Risks

A subagent knows only its brief, so the session checking its result is part of the rule. The reviewer rules are unchanged.

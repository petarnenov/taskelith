## Context

The G3 plan was finalized on 2026-10-27 on the G2 closure by `finalize-g3-plan` (#354). The owner's away delegate then accepted it (away run `20261027T152855Z-opencode-52355`), relayed by coordinator Niki.

## Goals / Non-Goals

Goals: record the acceptance in the plan's status, and list the paused OpenCode Go reviewers in the protocol's "Reviewer pauses", by coordinator Niki's instruction. Non-goals: any other edit of the plan or the protocol, new owner decisions, changes to D1 to D18, and starting any G3 item.

## Decisions

- **One sentence after the finalization.** The acceptance follows the sentence that records the finalization, so the status reads draft history, finalization, and acceptance in order. The sentence names the away delegate, as the plan's other delegate decisions do, and keeps the run id in this change's records.
- **One row per paused reviewer.** The four OpenCode Go reviewers share one quota and one reset time, but each gets its own row, so the table keeps one reviewer per row, the names match the "Reviewer invocations" rows, and the coordinator can remove a row on its own when a run succeeds early. The Antigravity CLI row is unchanged.

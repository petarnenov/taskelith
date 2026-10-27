## Why

The owner's away delegate, OpenCode `kimi-k2.7-code` in away run `20261027T152855Z-opencode-52355`, accepted the finalized G3 plan as merged in #354 (merge `a00cbe3a`). The plan's status records that it is final but not that the owner accepted it. On 2026-10-27 the OpenCode Go reviewers also hit their weekly quota, and coordinator Niki instructed listing them in the protocol's "Reviewer pauses".

## What Changes

- Status of `docs/g3-plan.md`: right after the sentence that records the finalization on the G2 closure ([ADR 0015](/docs/decisions/0015-g2-closure.md)), add "Accepted by the owner through the away delegate on 2026-10-27."
- [Reviewer pauses](/docs/agent-task-protocol.md#reviewer-pauses) in `docs/agent-task-protocol.md`: one row each for OpenCode CLI (kimi-k3.1-pro), (deepseek-v4-pro), (kimi-k2.7-code), and (qwen3.8-max), paused until about 2026-11-02 02:00 local time for the OpenCode Go weekly quota (HTTP 429 `GoUsageLimitError`), by the coordinator's instruction. The Antigravity CLI row stays.

## Capabilities

### New Capabilities

### Modified Capabilities

None. The change is documentation only, records an acceptance and reviewer pauses, so it sets `skip_specs: true`.

## Impact

Documentation only: one sentence in `docs/g3-plan.md`, four rows in the "Reviewer pauses" table of `docs/agent-task-protocol.md`, and this change's records. No other part of the plan or the protocol, no owner decision, and no G3 item changes. No code, contract, specification, or dependency changes.

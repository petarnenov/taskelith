## Why

The G3 provider terms reviews (`docs/qualification/codex.md` and `docs/qualification/claude-code.md`, "Consequences for D15") quote OpenAI's prohibition of "rotating accounts" and note that rotation across accounts may be read as bypassing protective measures. To avoid that problem, the owner decided on 2026-10-25, in the project conversation, that a session keeps the harness and the subscription slot it started with until its work is finished and the session and its agent are closed, and that neither is switched during the session. The owner explicitly rejected pinning across a whole task: a new session of the same task may get a different harness or slot by the normal selection.

## What Changes

- Amend ADR 0005 decision 5 ("Session affinity") with the owner's rule, following the inline amendment convention of ADR 0004 and ADR 0003, and name the amendment in the ADR's status.
- In `docs/g3-plan.md`, add one clause each to the scopes of items 5 (`define-account-pool-contract`), 12 (`implement-account-pool`), and 18 (`implement-harness-host-in-worker`, which owns harness invocation and reconciliation after a restart).
- Add one sentence to "Consequences for D15" in the Codex and Claude Code qualification records stating that the rule keeps a running session on its account.
- Modify the `harness-account-pools` "Session affinity" requirement.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `harness-account-pools`: session affinity covers the harness as well as the slot, lasts until the session and its agent are closed, and is per session, not per task.

## Impact

Documentation only. No code, no dependency change, and no change to D15, which the owner decided as (a). No legal conclusion is added.

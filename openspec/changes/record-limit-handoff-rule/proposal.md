## Why

ADR 0005 decision 5, as amended by `record-session-harness-pinning`, keeps a session on its harness and slot until it is closed, but leaves a limit to the general rule for an unavailable slot, and the next session of the task could then get another slot of the same harness. The terms reviews (`docs/qualification/codex.md` and `docs/qualification/claude-code.md`, "Consequences for D15") quote OpenAI's prohibition of "rotating accounts". On 2026-10-25 the owner clarified, in the project conversation (in Bulgarian, paraphrased here): when a session's subscription hits a usage or rate limit, the session writes a handoff and stops, and the work continues in a new session that reads the handoff; that new session goes only to a different harness, because the same harness on another subscription after a limit is the clearest case of rotating accounts; if no other harness is eligible, the task waits for the cooldown.

## What Changes

- Add a dated amendment to ADR 0005 decision 4 ("Cooldown") with the rule, point decision 5's amendment to it for limits, and update the status.
- In `docs/g3-plan.md`, add one clause each to items 4 (the handoff kept in the session model), 12 (the selection after a limit), and 18 (writing and delivering the handoff).
- Add one sentence to "Consequences for D15" in the Codex and Claude Code qualification records.
- Modify the `harness-account-pools` "Session affinity" requirement.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `harness-account-pools`: a limit ends the session with a handoff, and the work continues on a different harness or waits for the slot's cooldown.

## Impact

Documentation only. No code, and no change to D15, which the owner decided as (a). No legal conclusion is added.

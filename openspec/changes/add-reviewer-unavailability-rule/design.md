## Context

The review process allows one reviewer per change and rotates reviewers between changes. It had no rule for a reviewer that cannot run.

## Decisions

- **Unavailable means any failure to obtain a pass.** This includes an error, a run that opens no session, a quota limit, or an outage. A pass that runs and reports findings is not unavailability.
- **The 30-minute exclusion applies to every change.** During it, the coordinator assigns no new change to the reviewer, and no change uses it for a pass.
- **The replacement keeps the change.** The next authorized reviewer in the rotation becomes the change's assigned reviewer for its remaining passes, so a change still has one reviewer at a time and no cross-review. The pass count carries over and the three-pass cap does not reset.
- **The replacement is briefed in full.** The replacement's first pass is given the earlier passes' findings and fixes, so it can confirm them, and then reviews the whole change.
- **A paused reviewer is skipped.** A reviewer under a longer pause, for example a quota pause, is skipped until the pause ends.
- **Records.** `verification.md` records the failed attempts and the switch.

## Risks

The replacement reviews a change that another reviewer started. The full brief and the requirement to confirm the earlier findings limit that risk.

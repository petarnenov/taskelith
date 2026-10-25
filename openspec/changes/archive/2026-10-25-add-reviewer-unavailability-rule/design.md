## Context

The review process allows one reviewer per change and rotates reviewers between changes. It had no rule for a reviewer that cannot run. The existing requirement "Authorized single-reviewer review" is modified so that a replacement is not a cross-review.

## Decisions

- **Any reason counts.** An error, a run that opens no session, a quota limit, and an outage are examples, not a closed list. The exclusion applies whether or not the reviewer is already assigned. A pass that runs and reports findings is not unavailability.
- **The 30-minute exclusion applies to every change.** During it, the coordinator assigns no new change to the reviewer, and no change uses it for a pass.
- **The replacement is proposed, then keeps the change.** The worker proposes the next authorized reviewer in the rotation to the coordinator, who assigns it. It then becomes the change's assigned reviewer for its remaining passes, so a change still has one reviewer at a time and no cross-review. The pass count carries over and the three-pass cap does not reset.
- **The replacement is briefed in full.** The replacement's first pass is given the earlier passes' findings and fixes, so it can confirm them, and then reviews the whole change.
- **A paused reviewer is skipped.** A reviewer under a longer pause, for example a quota pause, is skipped until the pause ends.
- **Records.** `verification.md` records the failed attempts and the switch.

## Risks

The replacement reviews a change that another reviewer started. The full brief and the requirement to confirm the earlier findings limit that risk.

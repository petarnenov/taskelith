## Why

During 2026-10-24 the owner set rules for independent review: three authorized reviewers, one reviewer per task without cross review, at most three passes, owner decisions on findings left after the cap, and Low findings fixed without another review when they are the only findings. Earlier the same day the owner approved process proposals (every-instance prompts, a self-check and evidence check before the first pass, routing external-fact reviews to a reviewer with network access, and the options after the cap), and during this change's review approved rotation and read-only snapshots. These rules lived only in the agent's memory; the owner asked that they be recorded in the repository.

## What Changes

- Add an "Independent review process" section to `docs/governance.md` and raise the policy version to 2.
- Point AGENTS.md and the foundation ledger to it, add dated notes to ADR 0001 and ADR 0002, update the foundation ledger's governance-integration row, and modify the `bootstrap-governance` evidence-freshness requirement to allow the recorded unreviewed fixes.

## Capabilities

### New Capabilities
- `review-process`: Repository rules for authorized, read-only, single-reviewer independent review with a pass cap and Low-finding handling.

### Modified Capabilities
- `bootstrap-governance`: the evidence-freshness scenario allows unreviewed fixes that the review process permits, recorded as such.

## Impact

Documentation and policy only; no runtime or CI impact.

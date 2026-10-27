## Why

Under "One reviewer per task" every pass of a task comes from the same reviewer, so a blind spot of that reviewer's harness survives all three passes. On 2026-10-27 the owner approved, through the coordinator (Niki), a mixed scheme: a second reviewer of another harness makes a full, independent pass 2, and the first reviewer returns for a confirmation-only pass 3.

## What Changes

- `docs/governance.md`, policy version 5: "Two alternating reviewers per task" replaces "One reviewer per task". Reviewer A makes the full pass 1, reviewer B, of a different harness, makes a full, independent pass 2 that also checks the pass 1 fixes, and reviewer A makes pass 3, which only confirms the pass 2 fixes. A Low-only pass still ends the review, so after a Low-only pass 1, B is not used. The three-pass cap stays.
- "Unavailable reviewer": the 30-minute pause stays; a replacement must have a harness different from the task's other reviewer and takes the replaced reviewer's role, A or B, with its remaining passes and their scope. When no reviewer of such a harness is available, the coordinator may assign a different model of the same harness and records the reason in `verification.md`.
- "Rotation": A is the reviewer whose turn it is, B the next reviewer in the turn of a different harness; B then counts as the most recently assigned; when no reviewer of another harness is available, B may be a different model of A's harness.
- Transition: a task briefed before version 5 reached `dev`, including one already in review, finishes under version 4's one-reviewer rule.
- `docs/agent-task-protocol.md`: the coordinator names A and B in the brief, the worker records which reviewer ran each pass, the review prompt per pass, the replacement's harness, and reviewer A for the review of a returned branch.
- The `taskelith-task-protocol`, `taskelith-worker`, and `taskelith-coordinator` skills and the review line of `AGENTS.md` say the same.
- The Purpose of the living `review-process` spec describes the two alternating reviewers.
- The UI POC's "One reviewer per task" badge (`docs/ui-poc/src/screens/Reviews.tsx:306`) reads "Reviewers A and B per task".

## Capabilities

### New Capabilities

### Modified Capabilities

- `review-process`: renames "Authorized single-reviewer review" to "Authorized alternating reviewers" and changes it, changes "Unavailable reviewer" and "Rotation order", adds "Changes under the one-reviewer rule" and "No reviewer of another harness", and edits the living spec's Purpose directly.

## Impact

Process documentation only; no runtime, contract, or package change. The findings tooling needs no change (see `design.md`).

Exclusions: no review-pass statistics (a later `review-pass-statistics` change), no rebuild of the published UI POC artifact, and no change to the findings schema or scripts.

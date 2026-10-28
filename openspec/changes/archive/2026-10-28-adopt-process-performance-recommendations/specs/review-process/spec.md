## MODIFIED Requirements

### Requirement: Authorized alternating reviewers
Each change without an owner-accepted review exception SHALL be independently reviewed by two owner-authorized reviewers, A and B, of different harnesses unless "No reviewer of another harness" or "Reviewer assignment" allows one, each read-only with model and effort set in the invocation. Pass 1 SHALL be A's full review, pass 2 B's full, independent review that also checks pass 1's fixes, and pass 3 A's confirmation of pass 2's fixes only. No other reviewer SHALL cross-review the change.

#### Scenario: Review recorded
- **WHEN** a change's `verification.md` records an independent review
- **THEN** it records for each pass the reviewer, A or B, and the invocation, model, effort, and session ID, and records that the SHA-256 snapshots taken before and after each pass were equal

#### Scenario: Second pass
- **WHEN** pass 1 by reviewer A reports a Medium finding and the author fixes it
- **THEN** pass 2 is made by reviewer B, which checks that fix and reviews the whole change independently

#### Scenario: Third pass
- **WHEN** pass 2 by reviewer B reports a Medium finding and the author's fix changes code
- **THEN** pass 3 is made by reviewer A and confirms only the pass 2 fixes, without new scope

#### Scenario: Low-only first pass
- **WHEN** pass 1 by reviewer A reports only Low findings
- **THEN** they are fixed without another pass, and reviewer B is not used

#### Scenario: Second reviewer requested for the same change
- **WHEN** a reviewer other than the assigned A or B is requested for a change whose reviewers A and B are available
- **THEN** it is not used for that change

#### Scenario: Review depends on external facts
- **WHEN** a change's review depends on external facts
- **THEN** both of its reviewers have network access

### Requirement: Pass cap and finding handling
A change SHALL receive at most three review passes; findings of Critical, High, or Medium severity left after the third pass SHALL be decided by the owner, and a further pass SHALL need the owner's permission; Low findings SHALL be fixed, and a pass with only Low findings SHALL NOT trigger another pass.

#### Scenario: Findings remain after the third pass
- **WHEN** a third pass reports a Medium finding
- **THEN** the owner chooses to fix it without review, accept it, or defer it, and `verification.md` records the choice

#### Scenario: Further pass after the cap
- **WHEN** a fourth pass is requested for a change
- **THEN** it runs only if `verification.md` records the owner's permission

#### Scenario: Low-only pass
- **WHEN** a pass reports only Low findings
- **THEN** they are fixed, recorded as unreviewed fixes, and no further pass is run

#### Scenario: Low findings with higher findings
- **WHEN** a pass reports Low findings together with a Medium finding
- **THEN** all of them are fixed, and the next pass checks them or, when no further pass runs, they are recorded as unreviewed fixes

### Requirement: Preparation before the first pass
Before the first pass, the author SHALL self-check the change against the review criteria and run the evidence check, and `verification.md` SHALL record both; its generated part SHALL pass `make record-check`.

#### Scenario: First pass requested
- **WHEN** the first review pass of a change is started
- **THEN** `verification.md` already records the author's self-check and the evidence-check result, and `make record-check` passes

## ADDED Requirements

### Requirement: Conditional third pass
Pass 3 SHALL run only when the pass 2 fixes change a file other than a record or documentation file, that is `openspec/changes/**` except spec deltas, `docs/**` except `docs/contracts/**`, and root-level Markdown, or when pass 2 reported a Critical or High finding. Otherwise the review SHALL end after pass 2, and its fixes SHALL be recorded with the outcome `fixed-unreviewed`. The three-pass cap and the Low-only rule SHALL still apply.

#### Scenario: Record-only fixes
- **WHEN** pass 2 reports only Medium findings and their fixes change only the change's `verification.md` and `design.md`
- **THEN** no pass 3 runs, and those findings are recorded as `fixed-unreviewed`

#### Scenario: Code fix
- **WHEN** a pass 2 fix changes a file under `scripts/`
- **THEN** reviewer A confirms the pass 2 fixes in pass 3

#### Scenario: High finding
- **WHEN** pass 2 reports a High finding whose fix changes only documentation
- **THEN** pass 3 runs

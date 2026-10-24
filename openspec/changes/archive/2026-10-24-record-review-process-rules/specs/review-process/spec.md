## ADDED Requirements

### Requirement: Authorized single-reviewer review
Each Taskelith change without a review exception accepted by the owner under the governance policy SHALL be independently reviewed by one owner-authorized reviewer, invoked read-only with its model and effort set in the invocation; no second reviewer SHALL cross-review the same change, re-review passes by the assigned reviewer are allowed, and consecutive changes SHALL rotate among reviewers unless a change needs a particular one.

#### Scenario: Review recorded
- **WHEN** a change's `verification.md` records an independent review
- **THEN** it records the invocation, reviewer, model, effort, and session ID, and records that the SHA-256 snapshots taken before and after each pass were equal

#### Scenario: Second reviewer requested for the same change
- **WHEN** a change already has an assigned reviewer
- **THEN** another authorized reviewer is not used for it

#### Scenario: Review depends on external facts
- **WHEN** a change's review depends on external facts
- **THEN** it is assigned to a reviewer with network access

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
- **THEN** all of them are fixed, and the next pass checks them or, after the third pass, they are recorded as unreviewed fixes

### Requirement: Preparation before the first pass
Before the first pass, the author SHALL self-check the change against the review criteria and run the evidence check, and `verification.md` SHALL record both.

#### Scenario: First pass requested
- **WHEN** the first review pass of a change is started
- **THEN** `verification.md` already records the author's self-check and the evidence-check result

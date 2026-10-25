# review-process Specification

## Purpose
Govern independent review of Taskelith changes: authorized read-only reviewers, one reviewer per change at a time with rotation and a replacement when a reviewer is unavailable, at most three passes, owner decisions on remaining findings, and Low-only passes fixed without another review.

## Requirements

### Requirement: Authorized single-reviewer review
Each Taskelith change without a review exception accepted by the owner under the governance policy SHALL be independently reviewed by one owner-authorized reviewer at a time, invoked read-only with its model and effort set in the invocation. Re-review passes are allowed; no second reviewer SHALL cross-review it, and only an unavailable reviewer's replacement may take it over. Consecutive changes SHALL rotate among reviewers unless a change needs a particular one.

#### Scenario: Review recorded
- **WHEN** a change's `verification.md` records an independent review
- **THEN** it records the invocation, reviewer, model, effort, and session ID, and records that the SHA-256 snapshots taken before and after each pass were equal

#### Scenario: Second reviewer requested for the same change
- **WHEN** a change already has an assigned reviewer that is available
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

### Requirement: Unavailable reviewer
A reviewer that is unavailable for any reason SHALL NOT be used for any change for the next 30 minutes, whether or not it is assigned. The next authorized reviewer in the rotation that is not paused SHALL be proposed in its place and, once the coordinator assigns it, SHALL review the change's remaining passes. The pass count SHALL carry over, and `verification.md` SHALL record the failed attempts and the switch.

#### Scenario: Assigned reviewer fails to run
- **WHEN** a pass by the assigned reviewer fails, for example without opening a session
- **THEN** the next authorized reviewer in the rotation is proposed and, once assigned, its first pass confirms the resolution of the earlier passes' findings

#### Scenario: Pass count after a switch
- **WHEN** a change switches reviewer after its first pass
- **THEN** the replacement's first pass is the change's second pass

#### Scenario: Unavailable reviewer at assignment
- **WHEN** a reviewer was unavailable less than 30 minutes ago and a new change is assigned
- **THEN** the coordinator assigns the next reviewer in the rotation instead

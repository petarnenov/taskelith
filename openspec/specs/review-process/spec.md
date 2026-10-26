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
A reviewer whose review attempt does not run to a report SHALL NOT be used for any change for 30 minutes from that attempt; a pass that reports findings is not unavailability. The next authorized reviewer in the rotation that is not paused and meets the change's review requirements SHALL be proposed and, once assigned, SHALL review the remaining passes, first confirming the earlier findings and then reviewing the whole change.

#### Scenario: Assigned reviewer fails to run
- **WHEN** a review attempt by the assigned reviewer fails, for example without opening a session
- **THEN** the next authorized reviewer in the rotation is proposed and, once assigned, its first pass confirms the resolution of the earlier passes' findings and reviews the whole change

#### Scenario: Pass count after a switch
- **WHEN** a change switches reviewer after its first pass
- **THEN** the replacement's first pass is the change's second pass

#### Scenario: Unavailable reviewer at assignment
- **WHEN** a reviewer was unavailable less than 30 minutes ago and a new change is assigned
- **THEN** the coordinator assigns the next reviewer in the rotation instead

#### Scenario: Replacement needs network access
- **WHEN** a change whose review depends on external facts loses its reviewer
- **THEN** the replacement is a reviewer with network access

#### Scenario: Exclusion ends
- **WHEN** 30 minutes have passed since the failed attempt and no listed pause of that reviewer has an end time still in the future
- **THEN** the reviewer may be assigned again

### Requirement: Unavailable reviewer record
A change's `verification.md` SHALL record each failed review attempt with its time and the reviewer switch. Failed attempts SHALL NOT count toward the pass cap, and the pass count SHALL carry over to the replacement.

#### Scenario: Failed attempts recorded
- **WHEN** a change switches reviewer after failed attempts
- **THEN** `verification.md` lists each failed attempt with its time, and the pass numbering continues

### Requirement: Rotation order
Rotation SHALL follow the order of the authorized reviewer list in the governance policy, returning to the first after the last, and skip a reviewer that is unavailable, paused, or unable to meet the change's review requirements. Unless a change needs a particular reviewer, a new change SHALL go to the reviewer after the one most recently assigned. Reviewers of the same harness SHALL NOT be adjacent in the list, including the last and the first.

#### Scenario: Reviewer after a replacement
- **WHEN** a replacement reviewer was the most recently assigned
- **THEN** the next new change goes to the reviewer after the replacement in the list

#### Scenario: Reviewer that cannot meet the requirements
- **WHEN** the next reviewer in the list lacks network access and the change depends on external facts
- **THEN** it is skipped for that change

#### Scenario: Reviewers of the same harness
- **WHEN** the authorized reviewer list holds two reviewers of the same harness, for example two OpenCode CLI reviewers with different models
- **THEN** neither directly follows the other in the list, and the last entry and the first entry are not both of that harness

#### Scenario: Same harness after a skipped reviewer
- **WHEN** the turn skips a paused or unavailable reviewer that stands between two reviewers of the same harness in the list
- **THEN** those two reviewers may follow each other in the effective turn, and the list order is unchanged

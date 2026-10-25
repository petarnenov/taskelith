## MODIFIED Requirements

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

## ADDED Requirements

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

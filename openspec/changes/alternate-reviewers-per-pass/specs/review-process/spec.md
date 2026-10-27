## RENAMED Requirements

- FROM: `### Requirement: Authorized single-reviewer review`
- TO: `### Requirement: Authorized alternating reviewers`

## MODIFIED Requirements

### Requirement: Authorized alternating reviewers
Each Taskelith change without an owner-accepted review exception SHALL be independently reviewed by two owner-authorized reviewers, A and B, of different harnesses unless "No reviewer of another harness" applies, each invoked read-only with its model and effort set in the invocation. Pass 1 SHALL be A's full review, pass 2 B's full, independent review that also checks the pass 1 fixes, and pass 3 A's confirmation of the pass 2 fixes only. No other reviewer SHALL cross-review the change.

#### Scenario: Review recorded
- **WHEN** a change's `verification.md` records an independent review
- **THEN** it records for each pass the reviewer, A or B, and the invocation, model, effort, and session ID, and records that the SHA-256 snapshots taken before and after each pass were equal

#### Scenario: Second pass
- **WHEN** pass 1 by reviewer A reports a Medium finding and the author fixes it
- **THEN** pass 2 is made by reviewer B, which checks that fix and reviews the whole change independently

#### Scenario: Third pass
- **WHEN** pass 2 by reviewer B reports a Medium finding and the author fixes it
- **THEN** pass 3 is made by reviewer A and confirms only the pass 2 fixes, without new scope

#### Scenario: Low-only first pass
- **WHEN** pass 1 by reviewer A reports only Low findings
- **THEN** they are fixed without another pass, and reviewer B is not used

#### Scenario: Second reviewer requested for the same change
- **WHEN** a reviewer other than B is requested for a change whose reviewers A and B are available
- **THEN** it is not used for that change

#### Scenario: Review depends on external facts
- **WHEN** a change's review depends on external facts
- **THEN** both of its reviewers have network access

### Requirement: Unavailable reviewer
A reviewer whose review attempt does not run to a report SHALL NOT be used for any change for 30 minutes from that attempt; a pass that reports findings is not unavailability. The next authorized reviewer in the rotation that is not paused and meets the change's review requirements SHALL be proposed. A replacement of reviewer A or B SHALL differ in harness from the other unless "No reviewer of another harness" applies, and SHALL take that role with its remaining passes and their scope.

#### Scenario: Assigned reviewer fails to run
- **WHEN** a review attempt by reviewer B fails, for example without opening a session
- **THEN** the next authorized reviewer in the rotation whose harness differs from A's is proposed and, once assigned, makes pass 2 as reviewer B

#### Scenario: Reviewer A replaced before the third pass
- **WHEN** reviewer A fails to run pass 3
- **THEN** its replacement, of a harness different from B's, confirms only the pass 2 fixes

#### Scenario: Pass count after a switch
- **WHEN** a change switches reviewer after its first pass
- **THEN** the replacement's first pass is the change's second pass

#### Scenario: Unavailable reviewer at assignment
- **WHEN** a reviewer was unavailable less than 30 minutes ago and a new change is assigned
- **THEN** the coordinator assigns the next reviewer in the rotation instead

#### Scenario: Replacement needs network access
- **WHEN** a change whose review depends on external facts loses a reviewer
- **THEN** the replacement is a reviewer with network access

#### Scenario: Exclusion ends
- **WHEN** 30 minutes have passed since the failed attempt and no listed pause of that reviewer has an end time still in the future
- **THEN** the reviewer may be assigned again

### Requirement: Rotation order
Rotation SHALL follow the order of the governance policy's authorized reviewer list, wrapping around, and skip a reviewer that is unavailable, paused, or unable to meet the change's review requirements. Unless a change needs a particular one, a new change's reviewer A SHALL be the reviewer after the most recently assigned one, and its B the next after A of another harness while one is available. Same-harness reviewers SHALL NOT be adjacent in the list, including the last and the first.

#### Scenario: Reviewers of a new change
- **WHEN** a new change is assigned and the reviewer most recently assigned was another change's reviewer B
- **THEN** the new change's reviewer A is the next reviewer in the turn after that B, its reviewer B the next one after A whose harness differs from A's, and B becomes the most recently assigned

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

## ADDED Requirements

### Requirement: Changes under the one-reviewer rule
A change briefed before the alternating-reviewer rule reached `dev`, including one already in review, SHALL finish under the earlier rule: one assigned reviewer makes every pass, no second reviewer cross-reviews it, and an unavailable reviewer's replacement, the next reviewer in the rotation that is not paused and meets its review requirements, with no harness test, takes over the remaining passes, its first pass confirming the earlier findings and then reviewing the whole change.

#### Scenario: Change in review at the rule change
- **WHEN** a change had its first review pass before the rule reached `dev` and needs a second pass
- **THEN** its assigned reviewer makes the second pass, and no reviewer B is assigned

### Requirement: No reviewer of another harness
When no authorized reviewer of a harness different from the change's other reviewer is available, that is, not paused or unavailable and meeting the change's review requirements, the coordinator MAY assign a reviewer of the same harness with a different model, as reviewer B or as a replacement, and SHALL record the reason in the change's `verification.md`.

#### Scenario: Replacement without another harness
- **WHEN** reviewer B fails to run and every reviewer of a harness different from A's is paused or unavailable
- **THEN** the coordinator may assign a reviewer of A's harness with a different model as reviewer B, and `verification.md` records why

#### Scenario: Reviewer B without another harness
- **WHEN** a new change is assigned and no authorized reviewer of a harness different from reviewer A's is available, because each is paused, unavailable, or unable to meet the change's review requirements
- **THEN** the coordinator may assign another model of A's harness as reviewer B, and `verification.md` records why

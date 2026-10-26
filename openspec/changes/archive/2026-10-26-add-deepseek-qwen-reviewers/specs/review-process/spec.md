## MODIFIED Requirements

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

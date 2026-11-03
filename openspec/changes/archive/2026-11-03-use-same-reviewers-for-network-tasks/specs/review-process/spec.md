## MODIFIED Requirements

### Requirement: Authorized review sequence
Each change without an owner-accepted review exception SHALL be independently reviewed by owner-authorized reviewers, one per pass, as "Reviewer assignment" names them, each read-only with model and effort set in the invocation. Pass 1 SHALL be a full review, pass 2 a full, independent review that also checks pass 1's fixes, and pass 3 a full review of the current diff that also checks every pass 2 fix. Passes 1 and 3 SHALL have role A and pass 2 role B.

#### Scenario: Review recorded
- **WHEN** a change's `verification.md` records an independent review
- **THEN** it records for each pass the reviewer, its role, A or B, and the invocation, model, effort, and session ID, and records that the SHA-256 snapshots taken before and after each pass were equal

#### Scenario: Second pass
- **WHEN** pass 1 reports a Medium finding and the author fixes it
- **THEN** pass 2 is made by the reviewer of pass 2, which checks that fix and reviews the whole change independently

#### Scenario: Third pass
- **WHEN** pass 2 reports a Medium finding and the author fixes it
- **THEN** pass 3 is made by the reviewer of pass 3, which checks every pass 2 fix and reviews the whole current diff

#### Scenario: Low-only first pass
- **WHEN** pass 1 reports only Low findings
- **THEN** they are fixed without another pass, and the reviewer of pass 2 is not used

#### Scenario: Second reviewer requested for the same change
- **WHEN** a reviewer other than the assigned one of a pass is requested for a change whose assigned reviewers are available
- **THEN** it is not used for that change

#### Scenario: Review depends on external facts
- **WHEN** a change's review depends on external facts
- **THEN** the reviewers of passes 2 and 3 have network access, and pass 1 is `codex gpt-6-astra#medium`, which has none, so it cannot check external facts

### Requirement: Reviewer assignment
The coordinator SHALL assign each new change the reviewer of each pass that the governance policy's reviewer assignment names for the change, not the next ones in the rotation. A change whose review depends on external facts, which needs network access, SHALL have the same reviewers as every other change. An OpenCode reviewer SHALL NOT review pass 1 or 3, also not as a replacement, and MAY review pass 2 only of a documentation-only change.

#### Scenario: Assigned reviewers available
- **WHEN** a new change without external facts is assigned and the reviewers that the assignment names are available
- **THEN** pass 1 is `codex gpt-6-astra#medium`, pass 2 `claude claude-fable-5-1#medium`, and pass 3 `agy gemini-4-argon-medium#medium`

#### Scenario: Change that needs network access
- **WHEN** a new change's review depends on external facts, so it needs network access
- **THEN** pass 1 is `codex gpt-6-astra#medium`, pass 2 `claude claude-fable-5-1#medium`, and pass 3 `agy gemini-4-argon-medium#medium`

#### Scenario: OpenCode reviewer for a code change
- **WHEN** the reviewer of pass 2 of a change that is not documentation-only must be replaced and the next reviewer in the rotation is an OpenCode reviewer
- **THEN** that reviewer is skipped

### Requirement: Rule routing floor
The rule router SHALL be deterministic and, since rule version 2, SHALL recommend the reviewer and effort of passes 1, 2, and 3, with efforts keyed per pass. Its tier SHALL be `elevated` when a trigger fires (400 or more changed lines, 18 or more changed files, 3 or more capabilities, security, contract, or Docker paths, or size M-L or L) and `standard` otherwise. `standard` SHALL equal the owner's reviewer assignment, and no tier SHALL go below it.

#### Scenario: Large change
- **WHEN** a change without external facts changes 420 lines in 6 files of one capability
- **THEN** the rule recommends `elevated` with trigger `lines`, pass 1 `codex gpt-6-astra#high`, pass 2 `claude claude-fable-5-1#high`, and pass 3 `agy gemini-4-argon-medium#medium`

#### Scenario: Small change with external facts
- **WHEN** a change whose `design.md` has an "External facts" section changes 40 lines and fires no trigger
- **THEN** the rule recommends `standard` with pass 1 `codex gpt-6-astra#medium`, pass 2 `claude claude-fable-5-1#medium`, and pass 3 `agy gemini-4-argon-medium#medium`

#### Scenario: Same input, same decision
- **WHEN** the rule router routes the same features twice
- **THEN** both decisions are equal

#### Scenario: Record of rule version 2
- **WHEN** an archived `route.json` of rule version 2 is validated
- **THEN** its pass plans are checked against the version 2 table, with pass 2 `claude claude-opus-5-5`

#### Scenario: Record of rule version 3
- **WHEN** an archived `route.json` of rule version 3 is validated
- **THEN** its pass plans are checked against the version 3 table, with pass 3 `codex gpt-6.1-sol`

#### Scenario: Record of rule version 4
- **WHEN** an archived `route.json` of rule version 4 with external facts is validated
- **THEN** its pass plans are checked against the version 4 table, with pass 1 `claude claude-fable-5-1` and pass 2 `claude claude-opus-5-5`

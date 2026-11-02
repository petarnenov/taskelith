## MODIFIED Requirements

### Requirement: Reviewer assignment
The coordinator SHALL assign each new change the reviewer of each pass that the governance policy's reviewer assignment names for the change, not the next ones in the rotation. The reviewers it names for a change whose review depends on external facts, which needs network access, MAY share a harness in passes 1 and 2. An OpenCode reviewer SHALL NOT review pass 1 or 3, also not as a replacement, and MAY review pass 2 only of a documentation-only change.

#### Scenario: Assigned reviewers available
- **WHEN** a new change without external facts is assigned and the reviewers that the assignment names are available
- **THEN** pass 1 is `codex gpt-6-astra#medium`, pass 2 `claude claude-fable-5-1#medium`, and pass 3 `agy gemini-4-argon-medium#medium`

#### Scenario: Change that needs network access
- **WHEN** a new change's review depends on external facts, so it needs network access
- **THEN** pass 1 is `claude claude-fable-5-1#medium`, pass 2 `claude claude-opus-5-5#medium`, and pass 3 `agy gemini-4-argon-medium#medium`, and `verification.md` names this rule as the reason for the shared harness of passes 1 and 2

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
- **THEN** the rule recommends `standard` with pass 1 `claude claude-fable-5-1#medium`, pass 2 `claude claude-opus-5-5#medium`, and pass 3 `agy gemini-4-argon-medium#medium`

#### Scenario: Same input, same decision
- **WHEN** the rule router routes the same features twice
- **THEN** both decisions are equal

#### Scenario: Record of rule version 2
- **WHEN** an archived `route.json` of rule version 2 is validated
- **THEN** its pass plans are checked against the version 2 table, with pass 2 `claude claude-opus-5-5`

#### Scenario: Record of rule version 3
- **WHEN** an archived `route.json` of rule version 3 is validated
- **THEN** its pass plans are checked against the version 3 table, with pass 3 `codex gpt-6.1-sol`

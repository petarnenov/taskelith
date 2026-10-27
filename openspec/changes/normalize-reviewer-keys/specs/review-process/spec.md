## ADDED Requirements

### Requirement: Canonical reviewer key
In an active change, each reviewer of `findings.jsonl` and `passes.jsonl` SHALL use the canonical key: harness `claude`, `codex`, `opencode`, or `agy`; the model as its CLI takes it, with a provider prefix for OpenCode only; and a `variant`, the effort, `default` when the harness default ran. Validation SHALL reject other keys with file and line. Archived records SHALL NOT be rewritten; reports SHALL map their legacy keys through one alias table.

#### Scenario: Harness spelled another way
- **WHEN** a line of an active change's `findings.jsonl` names the harness `claude-code`
- **THEN** validation fails, names the file and line, and lists the canonical harnesses

#### Scenario: OpenCode model without its provider
- **WHEN** a line of an active change's `passes.jsonl` names the OpenCode model `kimi-k2.7-code`
- **THEN** validation fails, names the file and line, and asks for the model with its provider prefix

#### Scenario: Reviewer without an effort
- **WHEN** a line of an active change's `passes.jsonl` names a reviewer without `variant`
- **THEN** validation fails, names the file and line, and asks for the effort, `default` when the harness default ran

#### Scenario: Legacy key in an archived change
- **WHEN** an archived change's records name a reviewer by a spelling that the alias table lists
- **THEN** validation passes, the archived file is not rewritten, and `reviewers` and `index` count its passes and findings under the canonical key, in one row with that reviewer's other passes and findings

### Requirement: Reviewer assignment
The coordinator SHALL assign each new change the reviewers A and B that the governance policy's reviewer assignment names for the change, not the next ones in the rotation. The pair it names for a change that needs network access MAY share a harness. An OpenCode reviewer SHALL NOT be reviewer A, also not as a replacement, and MAY be reviewer B only of a documentation-only change.

#### Scenario: Assigned reviewers available
- **WHEN** a new change is assigned and the reviewers that the assignment names for it are available
- **THEN** its reviewers A and B are those reviewers

#### Scenario: Change that needs network access
- **WHEN** a new change needs network access
- **THEN** its reviewers are the pair that the assignment names for such a change, also when both are of one harness

#### Scenario: OpenCode reviewer for a code change
- **WHEN** reviewer B of a change that is not documentation-only must be replaced and the next reviewer in the rotation is an OpenCode reviewer
- **THEN** that reviewer is skipped

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
- **WHEN** pass 2 by reviewer B reports a Medium finding and the author fixes it
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

### Requirement: Rotation order
Rotation SHALL order the replacements of unavailable reviewers. It SHALL follow the order of the governance policy's authorized reviewer list, wrapping around, start after the replaced reviewer, and skip a reviewer that is unavailable, paused, unable to meet the change's review requirements, or barred from the role by "Reviewer assignment". Same-harness reviewers SHALL NOT be adjacent in the list, including the last and the first.

#### Scenario: Reviewers of a new change
- **WHEN** a new change is assigned
- **THEN** its reviewers come from the reviewer assignment, not from the rotation, whichever reviewer was assigned most recently

#### Scenario: Reviewer after a replacement
- **WHEN** a replacement reviewer was the most recently assigned and a new change is assigned
- **THEN** the new change gets the reviewers of the assignment, not the reviewer after the replacement in the list

#### Scenario: Replacement from the rotation
- **WHEN** reviewer A of a change fails to run and the reviewers after it in the list are available
- **THEN** the proposed replacement is the first reviewer after A in the list that meets the change's review requirements, may be reviewer A, and has a harness different from B's

#### Scenario: Reviewer that cannot meet the requirements
- **WHEN** the next reviewer in the list lacks network access and the change depends on external facts
- **THEN** it is skipped for that change

#### Scenario: Reviewers of the same harness
- **WHEN** the authorized reviewer list holds two reviewers of the same harness, for example two OpenCode CLI reviewers with different models
- **THEN** neither directly follows the other in the list, and the last entry and the first entry are not both of that harness

#### Scenario: Same harness after a skipped reviewer
- **WHEN** the turn skips a paused or unavailable reviewer that stands between two reviewers of the same harness in the list
- **THEN** those two reviewers may follow each other in the effective turn, and the list order is unchanged

# review-process Specification

## Purpose
Govern independent review of Taskelith changes: authorized read-only reviewers, two alternating reviewers per change, normally of different harnesses, A for passes 1 and 3 and B for pass 2, with rotation and a replacement when a reviewer is unavailable, at most three passes, owner decisions on remaining findings, and Low-only passes fixed without another review.

## Requirements

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
- **THEN** all of them are fixed, and the next pass checks them or, after the third pass, they are recorded as unreviewed fixes

### Requirement: Preparation before the first pass
Before the first pass, the author SHALL self-check the change against the review criteria and run the evidence check, and `verification.md` SHALL record both.

#### Scenario: First pass requested
- **WHEN** the first review pass of a change is started
- **THEN** `verification.md` already records the author's self-check and the evidence-check result

### Requirement: Unavailable reviewer
A reviewer whose review attempt does not run to a report SHALL NOT be used for any change for 30 minutes from that attempt; a pass that reports findings is not unavailability. The next authorized reviewer in the rotation that is not paused and meets the change's review requirements SHALL be proposed. A replacement of reviewer A or B SHALL differ in harness from the other unless "No reviewer of another harness" applies, and SHALL take that role with its remaining passes and their scope.

#### Scenario: Assigned reviewer fails to run
- **WHEN** a review attempt by reviewer B fails, for example without opening a session, and an authorized reviewer of a harness different from A's is available
- **THEN** the next authorized reviewer in the rotation whose harness differs from A's is proposed and, once assigned, makes pass 2 as reviewer B

#### Scenario: Reviewer A replaced before the third pass
- **WHEN** reviewer A fails to run pass 3 and an authorized reviewer of a harness different from B's is available
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

### Requirement: Unavailable reviewer record
A change's `verification.md` SHALL record each failed review attempt with its time and the reviewer switch. Failed attempts SHALL NOT count toward the pass cap, and the pass count SHALL carry over to the replacement.

#### Scenario: Failed attempts recorded
- **WHEN** a change switches reviewer after failed attempts
- **THEN** `verification.md` lists each failed attempt with its time, and the pass numbering continues

### Requirement: Rotation order
Rotation SHALL follow the order of the governance policy's authorized reviewer list, wrapping around, and skip a reviewer that is unavailable, paused, or unable to meet the change's review requirements. Unless a change needs a particular one, a new change's reviewer A SHALL be the reviewer after the most recently assigned one, and its B the next after A of another harness while one is available. Same-harness reviewers SHALL NOT be adjacent in the list, including the last and the first.

#### Scenario: Reviewers of a new change
- **WHEN** a new change is assigned, the reviewer most recently assigned was another change's reviewer B, and an authorized reviewer of a harness different from the new reviewer A's is available
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

### Requirement: Review findings record
Each finding of an independent review pass SHALL be one line of its change's `findings.jsonl`, matching the finding schema and categories, with bounded lines, no unknown properties, and no secret-like values. In an active change, a finding outside `openspec/changes/` SHALL name a capability, and any named capability SHALL exist under `openspec/specs`. `make verify` SHALL validate every findings file and require one in every active change, but not in changes archived before the record existed.

#### Scenario: Finding with an unknown category
- **WHEN** a line of a `findings.jsonl` names a category that the vocabulary does not list
- **THEN** validation fails and names the file and line

#### Scenario: Secret-like value in a finding
- **WHEN** a line's title or resolution holds a string shaped like a token or a URL with credentials
- **THEN** validation fails for that line

#### Scenario: Active change without a findings file
- **WHEN** an active change has no `findings.jsonl`
- **THEN** validation fails and names the missing file

#### Scenario: Older archived change
- **WHEN** a change archived before the record existed has no `findings.jsonl`
- **THEN** validation passes without it

#### Scenario: New category
- **WHEN** a maintainer adds one line to the category vocabulary
- **THEN** findings may use that category without a change to the schema or the script

#### Scenario: Code finding without a capability
- **WHEN** a finding of an active change concerns a file outside `openspec/changes/` and names no capability, or one without a directory under `openspec/specs`
- **THEN** validation fails and names the file and line

#### Scenario: Record finding without a capability
- **WHEN** a finding of an active change concerns a file under `openspec/changes/`, such as the change's own `verification.md`, and names no capability
- **THEN** validation passes for that line

#### Scenario: Record finding with an unknown capability
- **WHEN** a finding of an active change concerns a file under `openspec/changes/` and names a capability without a directory under `openspec/specs`
- **THEN** validation fails and names the file and line

#### Scenario: Archived finding without a capability
- **WHEN** an archived change holds a finding outside `openspec/changes/` without a capability
- **THEN** validation passes for that line, and the archived file is not rewritten

### Requirement: Findings index and checklist
`make findings ARGS="index"` SHALL count archived findings by category, capability, file, and reviewer, with the shares fixed (`fixed` and `fixed-unreviewed`), declined, and other. `make findings ARGS="checklist"` SHALL list the most frequent archived categories for the given capabilities and file globs, at most ten, each with its newest example title, and SHALL always add the same list for record findings, whose file is under `openspec/changes/`.

#### Scenario: Index of archived findings
- **WHEN** archived changes hold findings with the outcomes `fixed`, `fixed-unreviewed`, `declined`, and `deferred`
- **THEN** the index counts the first two as fixed, `declined` as declined, and `deferred` as other, per category, capability, file, and reviewer

#### Scenario: Checklist for a brief
- **WHEN** the checklist is requested for a capability and a file glob
- **THEN** it lists the categories of the archived findings whose capability matches or whose file matches the glob, most frequent first, each with its newest example title

#### Scenario: Record quality in every checklist
- **WHEN** the checklist is requested with any capabilities and file globs, or with none
- **THEN** it ends with a "Record quality" section that ranks the categories of the archived record findings the same way

#### Scenario: Active findings excluded
- **WHEN** an active change holds findings
- **THEN** neither the index nor the checklist counts them

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

### Requirement: Review pass summaries
Each independent review pass that runs to a report, also one without findings, SHALL be one line of its change's `passes.jsonl` that matches the pass schema: the change, pass, role A or B, reviewer, session, and counts by severity, with bounded lines, no unknown properties, and no secret-like values. `make verify` SHALL validate every `passes.jsonl` and require one in every active change, but not in archived changes, which are not rewritten.

#### Scenario: Pass without findings
- **WHEN** a review pass runs to a report without findings
- **THEN** its change's `passes.jsonl` holds one line for it with every count zero, and validation passes

#### Scenario: Active change without pass summaries
- **WHEN** an active change has no `passes.jsonl`
- **THEN** validation fails and names the missing file

#### Scenario: Archived change without pass summaries
- **WHEN** an archived change has no `passes.jsonl`
- **THEN** validation passes without it, and the archived change is not rewritten

#### Scenario: Secret-like value in a pass summary
- **WHEN** a line of a `passes.jsonl` holds a string shaped like a token
- **THEN** validation fails for that line without repeating the string

### Requirement: Pass summary consistency
Where a change has `passes.jsonl`, with a missing `findings.jsonl` taken as empty, each pass SHALL be summarized once, every finding's pass SHALL have a summary with the same reviewer and session, and each summary's counts SHALL equal its pass's findings by severity. Validation SHALL report each mismatch with its file and line.

#### Scenario: Counts differ from the findings
- **WHEN** a pass summary counts two Medium findings and `findings.jsonl` holds one Medium finding of that pass
- **THEN** validation fails and names the summary's file and line

#### Scenario: Finding of a pass without a summary
- **WHEN** a finding names a pass that `passes.jsonl` does not summarize
- **THEN** validation fails and names the finding's file and line

#### Scenario: Pass summarized twice
- **WHEN** two lines of a `passes.jsonl` summarize the same pass
- **THEN** validation fails for the second line

### Requirement: Missed finding attribution
A finding MAY name in `missedBy` what missed it: an earlier pass of its change with that pass's role, or the integration into `dev`. Validation SHALL fail when the named pass is not earlier than the finding's pass, or, where the change has `passes.jsonl`, when that pass has no summary or its summary has another role.

#### Scenario: Pass 2 finds what pass 1 missed
- **WHEN** a pass 2 finding names `missedBy` pass 1 with role A, and pass 1's summary has role A
- **THEN** validation passes for that line

#### Scenario: Missed by a later pass
- **WHEN** a pass 2 finding names `missedBy` pass 2 or a later pass
- **THEN** validation fails and names the finding's file and line

#### Scenario: Missed by a pass of another role
- **WHEN** a finding names `missedBy` pass 1 with role B, and pass 1's summary has role A
- **THEN** validation fails and names the finding's file and line

### Requirement: Reviewer statistics
`make findings ARGS="reviewers [--json]"` SHALL count archived review passes per reviewer and per role: passes, findings by severity, findings per pass, the share of passes with at least one Medium or worse finding, and the misses that `missedBy` attributes to them, plus the integration's misses and those of passes without a record. An archived change without `passes.jsonl` SHALL count only its passes with findings, with role unknown, and the output SHALL say so.

#### Scenario: Summarized pass without findings
- **WHEN** an archived change's `passes.jsonl` summarizes a pass without findings
- **THEN** the statistics count that pass for its reviewer and role

#### Scenario: Archived change without pass summaries
- **WHEN** an archived change has findings but no `passes.jsonl`
- **THEN** the statistics count one pass per pass number of its findings, with role unknown, and the output names that rule and the number of such changes

#### Scenario: Archived change without any review record
- **WHEN** an archived change has neither `findings.jsonl` nor `passes.jsonl`
- **THEN** it adds no pass, and the output states the number of such changes apart from the changes derived from findings

#### Scenario: Attributed miss
- **WHEN** an archived pass 2 finding names `missedBy` pass 1
- **THEN** the miss counts for the reviewer and role of pass 1

#### Scenario: Statistics as JSON
- **WHEN** the statistics are requested with `--json`
- **THEN** the output is JSON with the same rows and lists the changes without pass summaries

#### Scenario: Active records excluded
- **WHEN** an active change has pass summaries and findings
- **THEN** the statistics do not count them

### Requirement: Record links in the evidence check
The evidence check before the first pass SHALL include that every repository link of the change's records follows the record link rule and resolves, as `npm run verify:links` checks.

#### Scenario: Evidence check recorded
- **WHEN** the author runs the evidence check before the first pass
- **THEN** `verification.md` records the result of `npm run verify:links` with it

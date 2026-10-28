## RENAMED Requirements

- FROM: `### Requirement: Authorized alternating reviewers`
- TO: `### Requirement: Authorized review sequence`

- FROM: `### Requirement: Conditional third pass`
- TO: `### Requirement: Review sequence stop rule`

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
- **THEN** the reviewer of every pass has network access

### Requirement: Pass cap and finding handling
A change SHALL receive at most three review passes. Critical, High, or Medium findings of pass 3 SHALL be fixed without another review, recorded as unreviewed fixes, and checked under "Architect check of unreviewed fixes"; one the author does not fix SHALL be decided by the owner, and a further pass SHALL need the owner's permission. Low findings SHALL be fixed, and a pass with only Low findings SHALL NOT trigger another pass.

#### Scenario: Findings remain after the third pass
- **WHEN** a third pass reports a Medium finding
- **THEN** the author fixes it without another pass, records it as `fixed-unreviewed`, and the coordinator checks the fix as solution architect

#### Scenario: Finding left after the third pass
- **WHEN** the author does not fix a Medium finding of pass 3
- **THEN** the owner accepts it as a known risk or defers it, and `verification.md` records the choice

#### Scenario: Further pass after the cap
- **WHEN** a fourth pass is requested for a change
- **THEN** it runs only if `verification.md` records the owner's permission

#### Scenario: Low-only pass
- **WHEN** a pass reports only Low findings
- **THEN** they are fixed, recorded as unreviewed fixes, and no further pass is run

#### Scenario: Low findings with higher findings
- **WHEN** a pass reports Low findings together with a Medium finding
- **THEN** all of them are fixed, and the next pass checks them or, when no further pass runs, they are recorded as unreviewed fixes

### Requirement: Unavailable reviewer
A reviewer whose review attempt does not run to a report SHALL NOT be used for any change for 30 minutes from it; a pass that reports findings is not unavailability. The next reviewer in the rotation that is not paused, meets the change's review requirements, and may review the pass by "Reviewer assignment" SHALL be proposed. A replacement SHALL differ in harness from the adjacent passes' reviewers unless "No reviewer of another harness" applies, and SHALL take the replaced pass.

#### Scenario: Assigned reviewer fails to run
- **WHEN** a review attempt in pass 2 fails, for example without opening a session, and a reviewer of a harness different from those of passes 1 and 3 is available and may review pass 2
- **THEN** the next such reviewer in the rotation is proposed and, once assigned, makes pass 2 with role B

#### Scenario: Reviewer A replaced before the third pass
- **WHEN** the reviewer of pass 3 fails to run and an authorized reviewer of a harness different from pass 2's is available and may review pass 3
- **THEN** its replacement makes the full pass 3 with role A

#### Scenario: Pass count after a switch
- **WHEN** a change switches reviewer after its first pass
- **THEN** the replacement's first pass is the change's second pass

#### Scenario: Unavailable reviewer at assignment
- **WHEN** a reviewer that the assignment names for a pass was unavailable less than 30 minutes ago and a new change is assigned
- **THEN** the coordinator assigns instead the next reviewer in the rotation that may review that pass

#### Scenario: Replacement needs network access
- **WHEN** a change whose review depends on external facts loses a reviewer
- **THEN** the replacement is a reviewer with network access

#### Scenario: Exclusion ends
- **WHEN** 30 minutes have passed since the failed attempt and no listed pause of that reviewer has an end time still in the future
- **THEN** the reviewer may be assigned again

### Requirement: Rotation order
Rotation SHALL order the replacements of unavailable reviewers. It SHALL follow the order of the governance policy's authorized reviewer list, wrapping around, start after the replaced reviewer, and skip a reviewer that is unavailable, paused, unable to meet the change's review requirements, or barred from the pass by "Reviewer assignment". Same-harness reviewers SHALL NOT be adjacent in the list, including the last and the first.

#### Scenario: Reviewers of a new change
- **WHEN** a new change is assigned
- **THEN** its reviewers come from the reviewer assignment, not from the rotation, whichever reviewer was assigned most recently

#### Scenario: Reviewer after a replacement
- **WHEN** a replacement reviewer was the most recently assigned and a new change is assigned
- **THEN** the new change gets the reviewers of the assignment, not the reviewer after the replacement in the list

#### Scenario: Replacement from the rotation
- **WHEN** the reviewer of pass 1 fails to run and the reviewers after it in the list are available
- **THEN** the proposed replacement is the first reviewer after it in the list that meets the change's review requirements, may review pass 1, and has a harness different from pass 2's reviewer

#### Scenario: Reviewer that cannot meet the requirements
- **WHEN** the next reviewer in the list lacks network access and the change depends on external facts
- **THEN** it is skipped for that change

#### Scenario: Reviewers of the same harness
- **WHEN** the authorized reviewer list holds two reviewers of the same harness, for example two OpenCode CLI reviewers with different models
- **THEN** neither directly follows the other in the list, and the last entry and the first entry are not both of that harness

#### Scenario: Same harness after a skipped reviewer
- **WHEN** the turn skips a paused or unavailable reviewer that stands between two reviewers of the same harness in the list
- **THEN** those two reviewers may follow each other in the effective turn, and the list order is unchanged

### Requirement: No reviewer of another harness
When no authorized reviewer of a harness different from the adjacent passes' reviewers is available, that is, not paused or unavailable, meeting the change's review requirements, and allowed in the pass by "Reviewer assignment", the coordinator MAY assign a reviewer of the same harness with a different model, at assignment or as a replacement, and SHALL record the reason in the change's `verification.md`.

#### Scenario: Replacement without another harness
- **WHEN** the reviewer of pass 2 fails to run and every reviewer of a harness different from those of passes 1 and 3 is paused, unavailable, or barred from pass 2 for the change
- **THEN** the coordinator may assign a reviewer of their harness with a different model for pass 2, and `verification.md` records why

#### Scenario: Reviewer B without another harness
- **WHEN** a new change is assigned and no authorized reviewer of a harness different from pass 1's is available for pass 2, because each is paused, unavailable, unable to meet the change's review requirements, or barred from pass 2
- **THEN** the coordinator may assign another model of pass 1's harness for pass 2, and `verification.md` records why

#### Scenario: Barred reviewer of another harness
- **WHEN** the reviewer of pass 2 of a change that is not documentation-only must be replaced, and the only available reviewers of a harness other than that of passes 1 and 3 are OpenCode reviewers
- **THEN** they do not block the fallback, and the coordinator may assign another model of that harness for pass 2

### Requirement: Reviewer assignment
The coordinator SHALL assign each new change the reviewer of each pass that the governance policy's reviewer assignment names for the change, not the next ones in the rotation. The reviewers it names for a change whose review depends on external facts, which needs network access, MAY share a harness in adjacent passes. An OpenCode reviewer SHALL NOT review pass 1 or 3, also not as a replacement, and MAY review pass 2 only of a documentation-only change.

#### Scenario: Assigned reviewers available
- **WHEN** a new change without external facts is assigned and the reviewers that the assignment names are available
- **THEN** pass 1 is `codex gpt-6-astra#medium`, pass 2 `claude claude-opus-5-5#medium`, and pass 3 `codex gpt-6.1-sol#medium`

#### Scenario: Change that needs network access
- **WHEN** a new change's review depends on external facts, so it needs network access
- **THEN** passes 1 and 3 are `claude claude-fable-5-1#medium` and pass 2 `claude claude-opus-5-5#medium`, and `verification.md` names this rule as the reason for the shared harness

#### Scenario: OpenCode reviewer for a code change
- **WHEN** the reviewer of pass 2 of a change that is not documentation-only must be replaced and the next reviewer in the rotation is an OpenCode reviewer
- **THEN** that reviewer is skipped

### Requirement: Review sequence stop rule
The passes SHALL run in order until a pass reports only Low findings or none, whose Low findings SHALL be fixed without another review. Pass 3 SHALL run exactly when pass 2 reported a Medium, High, or Critical finding, whatever files its fixes change. The three-pass cap SHALL still apply.

#### Scenario: Clean first pass
- **WHEN** pass 1 reports no finding
- **THEN** no pass 2 runs

#### Scenario: Record-only fixes
- **WHEN** pass 2 reports only Medium findings and their fixes change only the change's `verification.md` and `design.md`
- **THEN** pass 3 runs

#### Scenario: Code fix
- **WHEN** pass 2 reports only Low findings and their fix changes a file under `scripts/`
- **THEN** no pass 3 runs, and those findings are recorded as `fixed-unreviewed`

#### Scenario: High finding
- **WHEN** pass 2 reports a High finding whose fix changes only documentation
- **THEN** pass 3 runs

### Requirement: Review route command
`make findings ARGS="route --change <change> [--json] [--no-shadow]"` SHALL derive an active change's features from its committed state against its merge base with `origin/dev`, decide by the rule router, consult the shadow router unless `--no-shadow` is given, and write `route.json`. Without writing, it SHALL exit 1 for an unknown change, an existing `route.json`, uncommitted work outside the change directory, or no merge base, and exit 2 for `archive` or a name not shaped as a change name.

#### Scenario: Route written
- **WHEN** a worker runs the command for an active change with a clean working tree
- **THEN** the change's `route.json` holds the features, the rule decision, and the shadow result, and the command prints the tier, its triggers, and the plan of each pass

#### Scenario: Existing route
- **WHEN** the change already has `route.json`
- **THEN** the command exits 1 and leaves the file unchanged

#### Scenario: Uncommitted work
- **WHEN** a file outside the change directory has uncommitted changes
- **THEN** the command exits 1 and writes nothing

#### Scenario: Archive as the change
- **WHEN** a worker runs the command with `--change archive`
- **THEN** the command exits 2 with its usage and writes nothing

### Requirement: Rule routing floor
The rule router SHALL be deterministic and, since rule version 2, SHALL recommend the reviewer and effort of passes 1, 2, and 3, with efforts keyed per pass. Its tier SHALL be `elevated` when a trigger fires (400 or more changed lines, 18 or more changed files, 3 or more capabilities, security, contract, or Docker paths, or size M-L or L) and `standard` otherwise. `standard` SHALL equal the owner's reviewer assignment, and no tier SHALL go below it.

#### Scenario: Large change
- **WHEN** a change without external facts changes 420 lines in 6 files of one capability
- **THEN** the rule recommends `elevated` with trigger `lines`, pass 1 `codex gpt-6-astra#high`, pass 2 `claude claude-opus-5-5#xhigh`, and pass 3 `codex gpt-6.1-sol#high`

#### Scenario: Small change with external facts
- **WHEN** a change whose `design.md` has an "External facts" section changes 40 lines and fires no trigger
- **THEN** the rule recommends `standard` with passes 1 and 3 `claude claude-fable-5-1#medium` and pass 2 `claude claude-opus-5-5#medium`

#### Scenario: Same input, same decision
- **WHEN** the rule router routes the same features twice
- **THEN** both decisions are equal

### Requirement: Shadow routing
The shadow router SHALL ask TypeSafe AI's Jev model one `noul` question, whether the change will need review pass 3, with criteria taken from the review sequence stop rule, never from the rule router's triggers. Its probability P(third), the threshold 0.4, the tier that P(third) maps to, `elevated` at or above the threshold and `standard` below it, and that tier's pass plans SHALL be recorded beside the rule's and SHALL NOT change the rule's recommendation.

#### Scenario: Disagreement
- **WHEN** the rule decides `standard` and the shadow router answers P(third) 0.8
- **THEN** `route.json` records both, the shadow tier is `elevated`, and the rule's pass plans stay the recommendation

#### Scenario: Below the threshold
- **WHEN** the shadow router answers P(third) 0.39
- **THEN** the shadow tier is `standard`

#### Scenario: Request content
- **WHEN** the shadow router sends a request
- **THEN** its `state` holds exactly the allowlisted keys and none of the rule's path flags

#### Scenario: Third pass criteria
- **WHEN** the shadow router sends a request
- **THEN** its true criterion is that the reviewer of pass 2 will find a Medium, High, or Critical issue, and its false criterion that the review ends at a Low-only or clean pass 1 or pass 2

### Requirement: Route record
`route.json` SHALL conform to `docs/review-findings/route.schema.json`, which rejects unknown properties and free text and takes the pass plans' shape from the rule version. `make findings ARGS="validate"` SHALL check every `route.json`, active and archived, against the schema, its change name, and the secret-like value check, and that the rule's tier, triggers, and pass plans are those its rule version gives. `route.json` SHALL be optional.

#### Scenario: Inconsistent tier
- **WHEN** a `route.json` has tier `standard` and trigger `lines`
- **THEN** validation reports the file and fails

#### Scenario: Triggers not fired by the features
- **WHEN** a `route.json` has 4099 changed lines, no trigger, and tier `standard`
- **THEN** validation reports the file and fails

#### Scenario: No route
- **WHEN** an active change has no `route.json`
- **THEN** validation does not report it

#### Scenario: Record of rule version 1
- **WHEN** an archived `route.json` of rule version 1 plans passes 1 and 2 by the version 1 reviewer table
- **THEN** validation accepts it

#### Scenario: Pass count of another version
- **WHEN** a `route.json` of rule version 1 plans three passes, or one of rule version 2 plans two
- **THEN** validation reports the file and fails

### Requirement: Route effect
`make findings ARGS="effect [--json]"` SHALL report, per archived change with `route.json`, the rule and shadow tiers, the reviewers that ran passes 1 and 2, the passes needed, and the findings by pass and severity, and in aggregate the agreement of the two tiers and, per router, the third pass share per tier. Changes whose shadow failed or was skipped SHALL be excluded from the shadow figures. A review that ended after pass 2 SHALL count two passes.

#### Scenario: Third pass share per tier
- **WHEN** two archived changes routed `elevated` needed 3 and 2 passes
- **THEN** the effect reports a third pass share of 50% for the rule's `elevated` tier

#### Scenario: Failed shadow
- **WHEN** an archived change's `route.json` records `timeout`
- **THEN** the change counts in the rule figures and not in the shadow figures

#### Scenario: No third pass after record-only fixes
- **WHEN** an archived change's pass 2 fixes were recorded as `fixed-unreviewed` and no pass 3 ran
- **THEN** the effect counts two passes needed and no third pass for it

### Requirement: Review command
`make review` SHALL run one review pass of an active change with the authorized reviewer its canonical key names, using its fixed command and flags in `scripts/reviewer-invocations.ts` and the effort of governance "Authorized reviewers", with the prompt and logs outside the worktree, and SHALL take the role of the pass when `ROLE` is empty. It SHALL write no `passes.jsonl` line; after a run that exits 0 and reports a valid session ID and the expected model, it SHALL print a line template.

#### Scenario: Fixed flags
- **WHEN** a pass runs with the key `codex gpt-6.1-sol#medium`
- **THEN** the reviewer runs `codex exec` with `-s read-only`, `-C` the worktree, and the prompt on stdin

#### Scenario: Unknown key
- **WHEN** `REVIEWER` is no key of the table
- **THEN** `scripts/review-run.ts` lists the keys, exits 2, and runs no reviewer

#### Scenario: Default role
- **WHEN** `ROLE` is empty for pass 2
- **THEN** the pass runs with role B, and its line template names role B

#### Scenario: Wrong role
- **WHEN** `ROLE` is B for pass 1 or 3, or A for pass 2, or is empty for a pass after pass 3
- **THEN** `scripts/review-run.ts` exits 2 and runs no reviewer

#### Scenario: Failed attempt
- **WHEN** the reviewer cannot start, exits non-zero, reports no session ID, or reports no model or another one, also in OpenCode's session export or a fresh Antigravity log, or Codex reports another effort or sandbox
- **THEN** `scripts/review-run.ts` exits 4 and writes no pass line

#### Scenario: Linked log
- **WHEN** `LOG` is a symbolic link, has other hard links, or is the prompt file
- **THEN** `scripts/review-run.ts` exits 1, runs no reviewer, and changes no file

#### Scenario: Pass line template
- **WHEN** a pass runs to a report
- **THEN** `passes.jsonl` is unchanged, and the printed template has the pass, role, reviewer, and session and fails the pass schema until its count placeholders are filled

## ADDED Requirements

### Requirement: Architect check of unreviewed fixes
Every fix that no later pass reviews, such as the fixes of a Low-only pass and the fixes after pass 3, SHALL be checked by the coordinator as solution architect before integration, and the check SHALL be recorded: one line in the change's `verification.md`, or, for a branch already archived, in the body of its integration pull request.

#### Scenario: Low-only pass 2
- **WHEN** pass 2 reports only Low findings and the author fixes them
- **THEN** the coordinator checks those fixes before integration and records the check

#### Scenario: Archived branch
- **WHEN** a branch whose unreviewed fixes the coordinator has not yet checked is already archived
- **THEN** the coordinator records the check in the integration pull request's body, not in the archived record

# review-process Specification

## Purpose
Govern independent review of Taskelith changes: authorized read-only reviewers, two alternating reviewers per change, normally of different harnesses, A for passes 1 and 3 and B for pass 2, with rotation and a replacement when a reviewer is unavailable, at most three passes, owner decisions on remaining findings, and Low-only passes fixed without another review.

## Requirements

### Requirement: Authorized alternating reviewers
Each change without an owner-accepted review exception SHALL be independently reviewed by two owner-authorized reviewers, A and B, of different harnesses unless "No reviewer of another harness" or "Reviewer assignment" allows one, each read-only with model and effort set in the invocation. Pass 1 SHALL be A's full review, pass 2 B's full, independent review that also checks pass 1's fixes, and pass 3 A's confirmation of pass 2's fixes only. No other reviewer SHALL cross-review the change.

#### Scenario: Review recorded
- **WHEN** a change's `verification.md` records an independent review
- **THEN** it records for each pass the reviewer, A or B, and the invocation, model, effort, and session ID, and records that the SHA-256 snapshots taken before and after each pass were equal

#### Scenario: Second pass
- **WHEN** pass 1 by reviewer A reports a Medium finding and the author fixes it
- **THEN** pass 2 is made by reviewer B, which checks that fix and reviews the whole change independently

#### Scenario: Third pass
- **WHEN** pass 2 by reviewer B reports a Medium finding and the author's fix changes code
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
- **THEN** all of them are fixed, and the next pass checks them or, when no further pass runs, they are recorded as unreviewed fixes

### Requirement: Preparation before the first pass
Before the first pass, the author SHALL self-check the change against the review criteria and run the evidence check, and `verification.md` SHALL record both; its generated part SHALL pass `make record-check`.

#### Scenario: First pass requested
- **WHEN** the first review pass of a change is started
- **THEN** `verification.md` already records the author's self-check and the evidence-check result, and `make record-check` passes

### Requirement: Unavailable reviewer
A reviewer whose review attempt does not run to a report SHALL NOT be used for any change for 30 minutes from it; a pass that reports findings is not unavailability. The next reviewer in the rotation that is not paused, meets the change's review requirements, and may take the role by "Reviewer assignment" SHALL be proposed. A replacement SHALL differ in harness from the other unless "No reviewer of another harness" applies, and SHALL take the replaced role and its remaining passes.

#### Scenario: Assigned reviewer fails to run
- **WHEN** a review attempt by reviewer B fails, for example without opening a session, and a reviewer of a harness different from A's is available and may be reviewer B of the change
- **THEN** the next such reviewer in the rotation is proposed and, once assigned, makes pass 2 as reviewer B

#### Scenario: Reviewer A replaced before the third pass
- **WHEN** reviewer A fails to run pass 3 and an authorized reviewer of a harness different from B's is available and may be reviewer A
- **THEN** its replacement, of a harness different from B's, confirms only the pass 2 fixes

#### Scenario: Pass count after a switch
- **WHEN** a change switches reviewer after its first pass
- **THEN** the replacement's first pass is the change's second pass

#### Scenario: Unavailable reviewer at assignment
- **WHEN** a reviewer that the assignment names for a role was unavailable less than 30 minutes ago and a new change is assigned
- **THEN** the coordinator assigns instead the next reviewer in the rotation that may take that role

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
`make findings ARGS="index"` SHALL count archived findings by category, capability, file, and reviewer, with the shares fixed (`fixed` and `fixed-unreviewed`), declined, and other. `make findings ARGS="checklist"` SHALL list the most frequent archived categories for the given capabilities and file globs, at most ten, each with its newest example title, SHALL always add the same list for record findings, and SHALL then name the dev commit it ranked, when there is one.

#### Scenario: Index of archived findings
- **WHEN** archived changes hold findings with the outcomes `fixed`, `fixed-unreviewed`, `declined`, and `deferred`
- **THEN** the index counts the first two as fixed, `declined` as declined, and `deferred` as other, per category, capability, file, and reviewer

#### Scenario: Checklist for a brief
- **WHEN** the checklist is requested for a capability and a file glob
- **THEN** it lists the categories of the archived findings whose capability matches or whose file matches the glob, most frequent first, each with its newest example title

#### Scenario: Record quality in every checklist
- **WHEN** the checklist is requested with any capabilities and file globs, or with none
- **THEN** a "Record quality" section that ranks the categories of the archived record findings the same way follows the review checklist

#### Scenario: Dev commit of the checklist
- **WHEN** git has the merge base of `HEAD` and `origin/dev` and can read its archive
- **THEN** the checklist ranks the archived findings as of that commit and ends with a line naming it, and without one it ranks the working tree's archive and names no commit

#### Scenario: Active findings excluded
- **WHEN** an active change holds findings
- **THEN** neither the index nor the checklist counts them

### Requirement: Changes under the one-reviewer rule
A change briefed before the alternating-reviewer rule reached `dev`, including one already in review, SHALL finish under the earlier rule: one assigned reviewer makes every pass, no second reviewer cross-reviews it, and an unavailable reviewer's replacement, the next reviewer in the rotation that is not paused and meets its review requirements, with no harness test, takes over the remaining passes, its first pass confirming the earlier findings and then reviewing the whole change.

#### Scenario: Change in review at the rule change
- **WHEN** a change had its first review pass before the rule reached `dev` and needs a second pass
- **THEN** its assigned reviewer makes the second pass, and no reviewer B is assigned

### Requirement: No reviewer of another harness
When no authorized reviewer of a harness different from the change's other reviewer is available, that is, not paused or unavailable, meeting the change's review requirements, and allowed in the role by "Reviewer assignment", the coordinator MAY assign a reviewer of the same harness with a different model, as reviewer B or as a replacement, and SHALL record the reason in the change's `verification.md`.

#### Scenario: Replacement without another harness
- **WHEN** reviewer B fails to run and every reviewer of a harness different from A's is paused, unavailable, or barred from role B for the change
- **THEN** the coordinator may assign a reviewer of A's harness with a different model as reviewer B, and `verification.md` records why

#### Scenario: Reviewer B without another harness
- **WHEN** a new change is assigned and no authorized reviewer of a harness different from reviewer A's is available, because each is paused, unavailable, unable to meet the change's review requirements, or barred from role B
- **THEN** the coordinator may assign another model of A's harness as reviewer B, and `verification.md` records why

#### Scenario: Barred reviewer of another harness
- **WHEN** reviewer B of a change that is not documentation-only must be replaced, and the only available reviewers of a harness other than A's are OpenCode reviewers
- **THEN** they do not block the fallback, and the coordinator may assign another model of A's harness as reviewer B

### Requirement: Review pass summaries
Each independent review pass that runs to a report, also one without findings, SHALL be one line of its change's `passes.jsonl` that matches the pass schema: the change, optional artifact, pass, role A or B, reviewer, session, and counts by severity, with bounded lines, no unknown properties, and no secret-like values. `make verify` SHALL validate every `passes.jsonl` and require one in every active change, but not in archived changes, which are not rewritten.

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

#### Scenario: Passes of several artifacts
- **WHEN** a change reviews two artifacts, each with its own reviewers and pass 1
- **THEN** its `passes.jsonl` holds one pass 1 line for each, naming its artifact, and validation passes

### Requirement: Pass summary consistency
Where a change has `passes.jsonl`, with a missing `findings.jsonl` taken as empty, each pass SHALL be summarized once per artifact, an absent artifact being its own, every finding's pass of its artifact SHALL have a summary with the same reviewer and session, and each summary's counts SHALL equal the findings of its artifact's pass by severity. Validation SHALL report each mismatch with its file and line, naming the artifact when there is one.

#### Scenario: Counts differ from the findings
- **WHEN** a pass summary counts two Medium findings and `findings.jsonl` holds one Medium finding of that pass
- **THEN** validation fails and names the summary's file and line

#### Scenario: Finding of a pass without a summary
- **WHEN** a finding names a pass that `passes.jsonl` does not summarize
- **THEN** validation fails and names the finding's file and line

#### Scenario: Pass summarized twice
- **WHEN** two lines of a `passes.jsonl` summarize the same pass of the same artifact, or both without an artifact
- **THEN** validation fails for the second line

#### Scenario: Same pass of two artifacts
- **WHEN** two lines of a `passes.jsonl` summarize pass 1, one of artifact `x` and one of artifact `y`
- **THEN** validation passes for both lines

#### Scenario: Finding of another artifact's pass
- **WHEN** a finding of artifact `y` names pass 1 and `passes.jsonl` summarizes pass 1 only for artifact `x`
- **THEN** validation fails and names the finding's file, line, and artifact

### Requirement: Missed finding attribution
A finding MAY name in `missedBy` what missed it: an earlier pass of its change and artifact with that pass's role, or the integration into `dev`. Validation SHALL fail when the named pass is not earlier than the finding's pass, or, where the change has `passes.jsonl`, when that pass of the finding's artifact has no summary or its summary has another role.

#### Scenario: Pass 2 finds what pass 1 missed
- **WHEN** a pass 2 finding names `missedBy` pass 1 with role A, and pass 1's summary has role A
- **THEN** validation passes for that line

#### Scenario: Missed by a later pass
- **WHEN** a pass 2 finding names `missedBy` pass 2 or a later pass
- **THEN** validation fails and names the finding's file and line

#### Scenario: Missed by a pass of another role
- **WHEN** a finding names `missedBy` pass 1 with role B, and pass 1's summary has role A
- **THEN** validation fails and names the finding's file and line

#### Scenario: Missed by a pass of another artifact
- **WHEN** a pass 2 finding of artifact `y` names `missedBy` pass 1 with role A, and only artifact `x` has a pass 1 summary
- **THEN** validation fails and names the finding's file and line

### Requirement: Reviewer statistics
`make findings ARGS="reviewers [--json]"` SHALL count archived review passes per reviewer and per role: passes, findings by severity, findings per pass, the share of passes with at least one Medium or worse finding, and the misses that `missedBy` attributes to them, plus the integration's misses and those of passes without a record. An archived change without `passes.jsonl` SHALL count only its passes with findings, with role unknown, and the output SHALL say so.

#### Scenario: Summarized pass without findings
- **WHEN** an archived change's `passes.jsonl` summarizes a pass without findings
- **THEN** the statistics count that pass for its reviewer and role

#### Scenario: Archived change without pass summaries
- **WHEN** an archived change has findings but no `passes.jsonl`
- **THEN** the statistics count one pass per artifact and pass number of its findings, with role unknown, and the output names that rule and the number of such changes

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

#### Scenario: Passes of several artifacts
- **WHEN** one reviewer makes pass 1 as reviewer A of artifacts `x` and `y` of an archived change, and a pass 2 finding of `y` names `missedBy` pass 1
- **THEN** the statistics count two passes for that reviewer and for role A, and the miss counts for pass 1 of `y`

### Requirement: Record links in the evidence check
The evidence check before the first pass SHALL include that every repository link of the change's records follows the record link rule and resolves, as `npm run verify:links` checks.

#### Scenario: Evidence check recorded
- **WHEN** the author runs the evidence check before the first pass
- **THEN** `verification.md` records the result of `npm run verify:links` with it

### Requirement: Checklist record
`make findings ARGS="checklist ... --save <change> --at <commit>"` SHALL write the active change's `checklist.json` per the checklist schema from the archive as of the brief's dev commit `<commit>`: query, generation time, dev commit, optional size, and both ranked category lists with counts and baselines. It SHALL refuse an unknown commit, a name that is not an active change, and an existing file. The checklist text SHALL name its dev commit.

#### Scenario: Saved checklist
- **WHEN** a worker runs the brief's checklist invocation with `--save <change> --at <commit>` for an active change
- **THEN** the change's `checklist.json` holds the invocation's capabilities, file globs, and top, the generation time, the commit, and the review and record quality categories with their counts and baselines

#### Scenario: Dev moved since the brief
- **WHEN** a change was archived on `dev` after the brief's dev commit and before the save
- **THEN** the saved checklist ranks the archive as of the brief's dev commit and leaves that change out

#### Scenario: Unknown commit
- **WHEN** `--at` names a commit that git does not know
- **THEN** the command fails and writes nothing

#### Scenario: Existing checklist
- **WHEN** `--save` names a change that already has a `checklist.json`
- **THEN** the command fails and leaves the file unchanged

#### Scenario: Reserved archive name
- **WHEN** `--save` names `archive` or a name without an active change directory
- **THEN** the command fails and writes nothing

### Requirement: Checklist record validation
Validation SHALL check every `checklist.json` against the schema, its change, and the vocabulary, and SHALL reject a record with an impossible time, a duplicate or unranked category, more categories than `top`, or baseline counts above their totals. Once the commit that first archives `measure-checklist-effect` exists, it SHALL require `checklist.json` in each active change whose `.openspec.yaml` was first committed in a descendant of that commit or is uncommitted, except in a shallow clone.

#### Scenario: Before the landing
- **WHEN** no commit has archived `measure-checklist-effect` yet
- **THEN** validation requires no `checklist.json`

#### Scenario: Change opened after the landing without a checklist
- **WHEN** an active change's `.openspec.yaml` was first committed in a descendant of the landing commit, or is not committed, and it has no `checklist.json`
- **THEN** validation fails and names the missing file

#### Scenario: Shallow clone
- **WHEN** validation runs in a shallow clone, whose boundary commit appears to add every file
- **THEN** it requires no `checklist.json`

#### Scenario: Change opened before the landing
- **WHEN** an active change's `.openspec.yaml` was first committed in a commit that does not descend from the landing commit, and it has no `checklist.json`
- **THEN** validation passes without it

#### Scenario: Archived change without a checklist
- **WHEN** an archived change has no `checklist.json`
- **THEN** validation passes without it, and the archived change is not rewritten

#### Scenario: Invalid checklist record
- **WHEN** a `checklist.json` does not match the schema, names another change, or names a category the vocabulary does not list
- **THEN** validation fails and names the file

#### Scenario: Impossible checklist record
- **WHEN** a `checklist.json` lists more of a baseline's findings than it has, more Medium or worse findings than all, a category twice, categories out of count order, more categories than `top`, or a time such as month 99
- **THEN** validation fails and names the file and the inconsistency

### Requirement: Checklist effect
`make findings ARGS="effect [--json]"` SHALL report, per archived change with `checklist.json` and per archive date, the share of pass-1 code findings, all and Medium or worse, whose category is in its review list, and of pass-1 record findings in its record quality list, each beside the expected share from its baseline, and pass-1 findings per size point or per 100 changed lines. Changes without `checklist.json` SHALL be listed and excluded.

#### Scenario: Observed against expected
- **WHEN** an archived change's review list names two of the categories of its three pass-1 code findings, and its review baseline holds 10 findings, 5 in the listed categories
- **THEN** the effect reports 67% observed against 50% expected for that change

#### Scenario: Later passes excluded
- **WHEN** an archived change with `checklist.json` has a pass 2 finding
- **THEN** the effect does not count it

#### Scenario: Aggregate by archive date
- **WHEN** two changes archived on the same day have 3 and 1 pass-1 code findings with expected shares 50% and 25%
- **THEN** the day's expected share is 44%, the findings-weighted mean

#### Scenario: Size normalization
- **WHEN** a change's `checklist.json` records size M and the change has 5 pass-1 findings
- **THEN** the effect reports 2.50 findings per size point, and a change without a size is normalized per 100 changed lines

#### Scenario: Archived change without a checklist
- **WHEN** an archived change has no `checklist.json`
- **THEN** the effect lists it as without checklist and leaves it out of every share

### Requirement: Canonical reviewer key
In an active change, each reviewer of `findings.jsonl` and `passes.jsonl` SHALL use the canonical key: harness `claude`, `codex`, `opencode`, or `agy`; the model as its CLI takes it, as `<provider>/<model>` with both parts non-empty for OpenCode only; and a `variant`, the effort, `default` when the harness default ran. Validation SHALL reject other keys with file and line. Archived records SHALL NOT be rewritten; reports SHALL map their legacy keys through one alias table.

#### Scenario: Harness spelled another way
- **WHEN** a line of an active change's `findings.jsonl` names the harness `claude-code`
- **THEN** validation fails, names the file and line, and lists the canonical harnesses

#### Scenario: OpenCode model without its provider
- **WHEN** a line of an active change's `passes.jsonl` names the OpenCode model `kimi-k2.7-code`
- **THEN** validation fails, names the file and line, and asks for the model with its provider prefix

#### Scenario: OpenCode model with an empty part
- **WHEN** a line of an active change's `findings.jsonl` or `passes.jsonl` names the OpenCode model `opencode-go/`
- **THEN** validation fails and names the file and line

#### Scenario: Reviewer without an effort
- **WHEN** a line of an active change's `passes.jsonl` names a reviewer without `variant`
- **THEN** validation fails, names the file and line, and asks for the effort, `default` when the harness default ran

#### Scenario: Legacy key in an archived change
- **WHEN** an archived change's records name a reviewer by a spelling that the alias table lists
- **THEN** validation passes, the archived file is not rewritten, and `reviewers` and `index` count its passes and findings under the canonical key, in one row with that reviewer's other passes and findings

### Requirement: Reviewer assignment
The coordinator SHALL assign each new change the reviewers A and B that the governance policy's reviewer assignment names for the change, not the next ones in the rotation. The pair it names for a change whose review depends on external facts, which needs network access, MAY share a harness. An OpenCode reviewer SHALL NOT be reviewer A, also not as a replacement, and MAY be reviewer B only of a documentation-only change.

#### Scenario: Assigned reviewers available
- **WHEN** a new change is assigned and the reviewers that the assignment names for it are available
- **THEN** its reviewers A and B are those reviewers

#### Scenario: Change that needs network access
- **WHEN** a new change's review depends on external facts, so it needs network access
- **THEN** its reviewers are the pair that the assignment names for such a change, also when both are of one harness

#### Scenario: OpenCode reviewer for a code change
- **WHEN** reviewer B of a change that is not documentation-only must be replaced and the next reviewer in the rotation is an OpenCode reviewer
- **THEN** that reviewer is skipped

### Requirement: Conditional third pass
Pass 3 SHALL run only when the pass 2 fixes change a file other than a record or documentation file, that is `openspec/changes/**` except spec deltas, `docs/**` except `docs/contracts/**`, and root-level Markdown, or when pass 2 reported a Critical or High finding. Otherwise the review SHALL end after pass 2, and its fixes SHALL be recorded with the outcome `fixed-unreviewed`. The three-pass cap and the Low-only rule SHALL still apply.

#### Scenario: Record-only fixes
- **WHEN** pass 2 reports only Medium findings and their fixes change only the change's `verification.md` and `design.md`
- **THEN** no pass 3 runs, and those findings are recorded as `fixed-unreviewed`

#### Scenario: Code fix
- **WHEN** a pass 2 fix changes a file under `scripts/`
- **THEN** reviewer A confirms the pass 2 fixes in pass 3

#### Scenario: High finding
- **WHEN** pass 2 reports a High finding whose fix changes only documentation
- **THEN** pass 3 runs

### Requirement: Review route command
`make findings ARGS="route --change <change> [--json] [--no-shadow]"` SHALL derive an active change's features from its committed state against its merge base with `origin/dev`, decide by the rule router, consult the shadow router unless `--no-shadow` is given, and write `route.json`. Without writing, it SHALL exit 1 for an unknown change, an existing `route.json`, uncommitted work outside the change directory, or no merge base, and exit 2 for `archive` or a name not shaped as a change name.

#### Scenario: Route written
- **WHEN** a worker runs the command for an active change with a clean working tree
- **THEN** the change's `route.json` holds the features, the rule decision, and the shadow result, and the command prints the tier, its triggers, and both pass plans

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
The rule router SHALL be deterministic and SHALL recommend the reviewers and effort of passes 1 and 2. Its tier SHALL be `elevated` when a trigger fires (400 or more changed lines, 18 or more changed files, 3 or more capabilities, security, contract, or Docker paths, or size M-L or L) and `standard` otherwise. Its reviewers SHALL stay within the owner's reviewer assignment, `standard` SHALL equal today's configured reviewers and effort, and no tier SHALL go below it.

#### Scenario: Large change
- **WHEN** a change without external facts changes 420 lines in 6 files of one capability
- **THEN** the rule recommends `elevated` with trigger `lines`, pass 1 `codex gpt-6.1-sol#high`, and pass 2 `claude claude-opus-5-5#xhigh`

#### Scenario: Small change with external facts
- **WHEN** a change whose `design.md` has an "External facts" section changes 40 lines and fires no trigger
- **THEN** the rule recommends `standard` with pass 1 `claude claude-fable-5-1#medium` and pass 2 `claude claude-opus-5-5#high`

#### Scenario: Same input, same decision
- **WHEN** the rule router routes the same features twice
- **THEN** both decisions are equal

### Requirement: Shadow routing
The shadow router SHALL send TypeSafe AI's Jev model only the structured features: counts, capability identifiers, booleans, the size, and the capability history figures, never paths, commits, change names, diff or source text, or finding text. Its tier, confidence, probabilities, expected passes, and the pass plans its tier maps to SHALL be recorded beside the rule's and SHALL NOT change the rule's recommendation.

#### Scenario: Disagreement
- **WHEN** the rule decides `standard` and the shadow router answers `elevated` with probability 0.8
- **THEN** `route.json` records both and the rule's pass plans stay the recommendation

#### Scenario: Request content
- **WHEN** the shadow router sends a request
- **THEN** its `state` holds exactly the allowlisted feature keys

### Requirement: Shadow router failure
When the credential is missing, no response arrives within 2 seconds, the connection fails, the HTTP status is not 2xx, or the response is invalid, the rule SHALL route alone, the command SHALL exit 0, and `route.json` SHALL record the failure as one of `missing-credential`, `timeout`, `network`, `rate-limited`, `overloaded`, `http-error`, or `invalid-response`, with the HTTP status where there is one. The shadow router SHALL NOT retry within the 2 seconds.

#### Scenario: Timeout
- **WHEN** the shadow endpoint does not answer within 2 seconds
- **THEN** the request is aborted, `route.json` records `timeout`, and the rule's pass plans stand

#### Scenario: Invalid answer
- **WHEN** the endpoint answers 200 with a probability above 1
- **THEN** `route.json` records `invalid-response` and no part of the body

#### Scenario: Rate limit
- **WHEN** the endpoint answers 429
- **THEN** `route.json` records `rate-limited` with `httpStatus` 429

### Requirement: Router credential
The shadow router's credential SHALL be read only from the environment variable `JEV_MAF_LAB`, by name. Its value SHALL NOT appear in any output, error, log, or record, and failures SHALL be reported by reason code only, without messages, bodies, or headers.

#### Scenario: Sentinel credential
- **WHEN** `JEV_MAF_LAB` holds a sentinel value and each failure path is exercised
- **THEN** no stdout, stderr, thrown error, or `route.json` contains the sentinel

#### Scenario: Unset credential
- **WHEN** `JEV_MAF_LAB` is unset
- **THEN** no request is sent and `route.json` records `missing-credential`

### Requirement: Route record
`route.json` SHALL conform to `docs/review-findings/route.schema.json`, which rejects unknown properties and free text. `make findings ARGS="validate"` SHALL check every `route.json`, active and archived, against the schema, its change name, and the secret-like value check, and SHALL check that the rule's tier is `elevated` exactly when triggers fired, and that its triggers and pass plans are those that its rule version gives for its features and tier. `route.json` SHALL be optional.

#### Scenario: Inconsistent tier
- **WHEN** a `route.json` has tier `standard` and trigger `lines`
- **THEN** validation reports the file and fails

#### Scenario: Triggers not fired by the features
- **WHEN** a `route.json` has 4099 changed lines, no trigger, and tier `standard`
- **THEN** validation reports the file and fails

#### Scenario: No route
- **WHEN** an active change has no `route.json`
- **THEN** validation does not report it

### Requirement: Route effect
`make findings ARGS="effect [--json]"` SHALL report, per archived change with `route.json`, the rule and shadow tiers, the reviewers that ran passes 1 and 2, the passes needed, and the findings by pass and severity, and in aggregate the agreement of the two tiers and, per router, the third pass share per tier. Changes whose shadow failed or was skipped SHALL be excluded from the shadow figures. A review ended after pass 2 by the conditional third pass SHALL count two passes.

#### Scenario: Third pass share per tier
- **WHEN** two archived changes routed `elevated` needed 3 and 2 passes
- **THEN** the effect reports a third pass share of 50% for the rule's `elevated` tier

#### Scenario: Failed shadow
- **WHEN** an archived change's `route.json` records `timeout`
- **THEN** the change counts in the rule figures and not in the shadow figures

#### Scenario: No third pass after record-only fixes
- **WHEN** an archived change's pass 2 fixes were recorded as `fixed-unreviewed` and no pass 3 ran
- **THEN** the effect counts two passes needed and no third pass for it

### Requirement: Archive routing evaluation
`make findings ARGS="route-evaluation --save <change>"` SHALL route each reviewed archived single-artifact change by both routers on the diff of the parent of its first branch commit naming pass 1, fixes before it included, or its merged diff marked approximate, and the capability history of changes merged before its base. It SHALL write one line per change with the outcome, report changes without `passes.jsonl` as lower bounds, and stop on HTTP 401 to 403; `--rule-only` SHALL skip the shadow.

#### Scenario: No future history
- **WHEN** the evaluation routes a change merged before a later change of the same capability
- **THEN** the later change does not count in its capability history

#### Scenario: Missing credential
- **WHEN** `JEV_MAF_LAB` is unset and `--rule-only` is not given
- **THEN** the command exits 1 and writes nothing

#### Scenario: Refused shadow
- **WHEN** the shadow router fails with HTTP 401, 402, or 403
- **THEN** the command sends no further request, exits 1, and writes nothing

### Requirement: Review command
`make review` SHALL run one review pass of an active change with the authorized reviewer its canonical key names, using its fixed command and flags in `scripts/reviewer-invocations.ts` and the effort of governance "Authorized reviewers", with the prompt and logs resolving outside the worktree. It SHALL write no `passes.jsonl` line; after a run that exits 0 and reports a valid session ID and the expected model, it SHALL print a line template whose counts fail validation until filled.

#### Scenario: Fixed flags
- **WHEN** a pass runs with the key `codex gpt-6.1-sol#medium`
- **THEN** the reviewer runs `codex exec` with `-s read-only`, `-C` the worktree, and the prompt on stdin

#### Scenario: Unknown key
- **WHEN** `REVIEWER` is no key of the table
- **THEN** `scripts/review-run.ts` lists the keys, exits 2, and runs no reviewer

#### Scenario: Wrong role
- **WHEN** `ROLE` is B for pass 1 or 3, or A for pass 2
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

### Requirement: Review route gate
Before pass 1, when the change's `route.json` is missing or was made for another merge base or another tree outside the change directory, `make review` SHALL route the change only on a clean tree with a passing `make verify` stamp and then stop for the commit, and SHALL otherwise refuse without routing. Later passes SHALL NOT route.

#### Scenario: No stamp
- **WHEN** pass 1 starts with a missing or stale `route.json` and no stamp of the tree
- **THEN** `scripts/review-run.ts` exits 1, routes nothing, and runs no reviewer

#### Scenario: Stamped tree
- **WHEN** pass 1 starts with a missing `route.json` on a stamped clean tree
- **THEN** `scripts/review-run.ts` writes `route.json`, exits 3, and runs no reviewer

#### Scenario: Failed route
- **WHEN** routing fails after a stale `route.json` was deleted
- **THEN** `scripts/review-run.ts` restores it, exits 1, and runs no reviewer

### Requirement: Reviewer environment
`make review` SHALL start the reviewer with no inherited environment except `PATH`, `HOME`, `USER`, `LANG`, `TERM`, `TMPDIR`, and the variables that the reviewer's row declares, also none that the Node.js runtime adds to child processes, so that no secret reaches a reviewer.

#### Scenario: Planted secret
- **WHEN** the caller's environment holds `JEV_MAF_LAB` and another secret
- **THEN** neither the names nor the values reach the reviewer process

#### Scenario: Runtime variable
- **WHEN** `NODE_V8_COVERAGE` is set in the caller's environment
- **THEN** the reviewer process does not get it

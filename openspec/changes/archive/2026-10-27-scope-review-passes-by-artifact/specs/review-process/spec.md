## MODIFIED Requirements

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

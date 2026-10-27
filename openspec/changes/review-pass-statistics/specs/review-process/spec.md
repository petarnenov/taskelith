## ADDED Requirements

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
Where a change has both `findings.jsonl` and `passes.jsonl`, each pass SHALL be summarized once, every finding's pass SHALL have a summary with the same reviewer and session, and each summary's counts SHALL equal its pass's findings by severity. Validation SHALL report each mismatch with its file and line.

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
`make findings ARGS="reviewers [--json]"` SHALL count archived review passes per reviewer and per role: passes, findings by severity, findings per pass, the share of passes with at least one Medium or worse finding, and the misses that `missedBy` attributes to them, plus the integration's misses. An archived change without `passes.jsonl` SHALL count only its passes with findings, with role unknown, and the output SHALL say so.

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

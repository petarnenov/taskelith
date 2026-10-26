## ADDED Requirements

### Requirement: Review findings record
Each finding of an independent review pass SHALL be recorded as one line of its change's `findings.jsonl`, matching the repository's finding schema and category vocabulary, with bounded lines, no unknown properties, and no secret-like values. `make verify` SHALL validate every findings file and require one in every active change, but not in changes archived before the record existed.

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

### Requirement: Findings index and checklist
`npm run findings -- index` SHALL count archived findings by category, capability, file, and reviewer, with the shares fixed (`fixed` and `fixed-unreviewed`), declined, and other. `npm run findings -- checklist` SHALL list the most frequent archived categories for the given capabilities and file globs, at most ten, each with its newest example title.

#### Scenario: Index of archived findings
- **WHEN** archived changes hold findings with the outcomes `fixed`, `fixed-unreviewed`, `declined`, and `deferred`
- **THEN** the index counts the first two as fixed, `declined` as declined, and `deferred` as other, per category, capability, file, and reviewer

#### Scenario: Checklist for a brief
- **WHEN** the checklist is requested for a capability and a file glob
- **THEN** it lists the categories of the archived findings whose capability matches or whose file matches the glob, most frequent first, each with its newest example title

#### Scenario: Active findings excluded
- **WHEN** an active change holds findings
- **THEN** neither the index nor the checklist counts them

## MODIFIED Requirements

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

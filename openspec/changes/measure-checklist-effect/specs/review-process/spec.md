## MODIFIED Requirements

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

## ADDED Requirements

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

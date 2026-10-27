## ADDED Requirements

### Requirement: Checklist record
`make findings ARGS="checklist ... --save <change>"` SHALL write the active change's `checklist.json` per the checklist schema: query, generation time, dev commit, optional size, and both ranked category lists with counts and baseline. It SHALL NOT overwrite one. `--json` SHALL print the lists as JSON. Validation SHALL check every `checklist.json` and require one in each active change created on or after 2026-10-28, by its `.openspec.yaml`, or without a created date.

#### Scenario: Saved checklist
- **WHEN** a worker runs the brief's checklist invocation with `--save <change>` for an active change
- **THEN** the change's `checklist.json` holds the invocation's capabilities, file globs, and top, the generation time, the dev commit, and the review and record quality categories with their counts and baselines

#### Scenario: Existing checklist
- **WHEN** `--save` names a change that already has a `checklist.json`
- **THEN** the command fails and leaves the file unchanged

#### Scenario: Active change after the cutoff without a checklist
- **WHEN** an active change created on or after 2026-10-28, or without a created date, has no `checklist.json`
- **THEN** validation fails and names the missing file

#### Scenario: Active change before the cutoff
- **WHEN** an active change created before 2026-10-28 has no `checklist.json`
- **THEN** validation passes without it

#### Scenario: Archived change without a checklist
- **WHEN** an archived change has no `checklist.json`
- **THEN** validation passes without it, and the archived change is not rewritten

#### Scenario: Invalid checklist record
- **WHEN** a `checklist.json` does not match the schema, names another change, or names a category the vocabulary does not list
- **THEN** validation fails and names the file

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

## MODIFIED Requirements

### Requirement: Review findings in the task flow
A worker SHALL create an empty `findings.jsonl` and `passes.jsonl` with its change, append a summary of every review pass that runs to a report and each of its findings, and at the archive check that both files exist and validate. Failed review attempts SHALL add no lines. The coordinator SHALL include in every brief the checklist that `make findings ARGS="checklist"` prints for the task's capabilities and files.

#### Scenario: Pass with findings
- **WHEN** a review pass reports findings
- **THEN** the worker appends one line per finding to `findings.jsonl` with its outcome once the pass's findings are resolved

#### Scenario: Pass summary
- **WHEN** a review pass runs to a report, with or without findings
- **THEN** the worker appends one summary line for it to `passes.jsonl`

#### Scenario: Review without findings
- **WHEN** a change is archived after a review that found nothing
- **THEN** its archived `findings.jsonl` exists and is empty

#### Scenario: Failed review attempt
- **WHEN** a review attempt does not run to a report
- **THEN** no line is added to `findings.jsonl` or `passes.jsonl`

#### Scenario: Brief for a new task
- **WHEN** the coordinator assigns a task
- **THEN** the brief contains the checklist printed for the capabilities and files the task is expected to touch

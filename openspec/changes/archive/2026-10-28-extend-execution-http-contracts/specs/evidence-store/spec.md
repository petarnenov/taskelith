## MODIFIED Requirements

### Requirement: Evidence reads
`readEvidence` and `downloadEvidence` SHALL accept the browser session or the operator credential and SHALL serve a record only to a `project-viewer` or above on its project or to an `installation-owner`, any other principal getting the 404 of an unknown record, and `readTaskResult` SHALL return every evidence record of the task once an attempt has ended.

#### Scenario: Task result
- **WHEN** the result of a task with an ended attempt and published evidence is read
- **THEN** it lists the task's evidence records in publication order

#### Scenario: Reader of another project
- **WHEN** a `project-viewer` of one project reads or downloads an evidence record of another project
- **THEN** the answer is 404, as for an unknown record

### Requirement: Evidence retention
A record SHALL be removable only once 365 days have passed since its publication, and its content only when no record refers to its digest any more, serialized with publications of that digest. `retireEvidence` SHALL remove them for a `project-maintainer` of the record's project, refusing an early retirement with 422 and the end of the retention as `details.retainedUntil`.

#### Scenario: Early retirement
- **WHEN** a record younger than 365 days is retired
- **THEN** it is refused as `precondition-failed` with reason `retention-not-elapsed`

#### Scenario: Retention end in the refusal
- **WHEN** `retireEvidence` refuses a record published 30 days ago
- **THEN** the answer is 422 with `details.retainedUntil` 365 days after its publication

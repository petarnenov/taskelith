## MODIFIED Requirements

### Requirement: Admission record
A task admission SHALL be a frozen record that binds the task and its kind (`planning` or `implementation`), the workflow identifier and version, the stage, the work item when there is one, the artifact revisions the task works from (at most one per artifact), and the policy revision of the run binding, and SHALL carry the revisions the task created, its state, a generation, and the ownership generation of a fenced dispatch. It SHALL NOT share arrays with its inputs.

#### Scenario: Admitted implementation task
- **WHEN** an implementation task bound to a work item is admitted
- **THEN** the frozen record names the stage, the work item, the revisions its prerequisite gates judged, and the policy revision of the run, is `admitted`, and is at generation 1

#### Scenario: Fenced dispatch
- **WHEN** an admission is used with ownership generation 3 and then records a created revision
- **THEN** it binds ownership generation 3 in both records, and an admission used without one binds none

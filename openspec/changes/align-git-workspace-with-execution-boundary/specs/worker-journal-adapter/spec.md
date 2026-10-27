## ADDED Requirements

### Requirement: Execution group traversal
Given an execution group, the adapter SHALL give `dataRoot`, `worker/`, and `worker/workspaces/` that group and mode `0710` at enrollment and at every start, SHALL leave every control-record directory at `0700`, and SHALL fail with `precondition-failed`, enrolling nothing, when the worker cannot give a directory that group.

#### Scenario: Root enrolled before
- **WHEN** a root enrolled without an execution group is opened with one
- **THEN** `worker/` and `worker/workspaces/` have that group and mode `0710`

#### Scenario: Worker outside the group
- **WHEN** the worker, as root with only `CAP_SETUID`, `CAP_SETGID`, and `CAP_KILL`, enrolls without the execution group as a supplementary group
- **THEN** enrollment fails and leaves no `worker/` subtree

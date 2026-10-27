## ADDED Requirements

### Requirement: Checklist record in the task flow
A worker SHALL save the checklist of its brief as the change's `checklist.json` when it creates the change, before the first review pass, by running the brief's exact `make findings ARGS="checklist ..."` invocation with `--save <change>` and, when the brief gives a size, `--size`. It SHALL NOT edit the file afterwards, and the archive SHALL keep it.

#### Scenario: Plan time
- **WHEN** a worker creates the OpenSpec change of a task whose brief holds a checklist
- **THEN** it runs the brief's checklist invocation with `--save <change>` and commits the resulting `checklist.json`

#### Scenario: Archive
- **WHEN** the worker archives the change
- **THEN** the archived change directory holds the unchanged `checklist.json`

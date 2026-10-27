## ADDED Requirements

### Requirement: Checklist record in the task flow
A worker SHALL save the checklist of its brief as the change's `checklist.json` when it creates the change, before the first review pass, by running the brief's exact `make findings ARGS="checklist ..."` invocation with `--save <change> --at <commit>`, the dev commit the brief names, and, when the brief gives a size, `--size`. It SHALL NOT edit the file afterwards, and the archive SHALL keep it.

#### Scenario: Plan time
- **WHEN** a worker creates the OpenSpec change of a task whose brief holds a checklist
- **THEN** it runs the brief's checklist invocation with `--save <change> --at <commit>` and commits the resulting `checklist.json`

#### Scenario: Archive
- **WHEN** the worker archives the change
- **THEN** the archived change directory holds the unchanged `checklist.json`

### Requirement: Checklist in the brief
The coordinator SHALL give in every brief the output of `make findings ARGS="checklist ..."` for the task's capabilities and files, the exact invocation, the dev commit that the output names, and the task's size (S, S-M, M, M-L, or L), so that the worker can save the same checklist with `--at`.

#### Scenario: Brief with a checklist
- **WHEN** the coordinator assigns a task
- **THEN** the brief holds the checklist output with its dev commit line, the invocation, and the size

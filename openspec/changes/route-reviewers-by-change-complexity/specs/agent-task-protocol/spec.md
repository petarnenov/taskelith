## ADDED Requirements

### Requirement: Review route in the task flow
After `make verify` passes on the committed implementation and before review pass 1, a worker SHALL run `make findings ARGS="route --change <change>"` and commit the resulting `route.json`. It SHALL NOT edit the file afterwards, and the archive SHALL keep it. Until governance authorizes the routed effort, the brief's reviewers and effort SHALL apply, and the worker SHALL report a difference to the coordinator.

#### Scenario: Before pass 1
- **WHEN** a worker has committed the implementation of a change and `make verify` passed
- **THEN** it runs the route command and commits `route.json` before it starts review pass 1

#### Scenario: Route differs from the brief
- **WHEN** `route.json` names another reviewer A or effort than the brief
- **THEN** the worker reviews with the brief's reviewers and effort and reports the difference to the coordinator

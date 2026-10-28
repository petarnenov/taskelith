## ADDED Requirements

### Requirement: Review route in the task flow
After committing the implementation and before the `make verify` run recorded for pass 1, a worker SHALL run `make findings ARGS="route --change <change>"` and commit `route.json` unedited; the archive SHALL keep it. `route.json` SHALL only recommend: the brief SHALL name the reviewers, and an effort above today's SHALL apply only once an owner-approved governance change authorizes it. The worker SHALL report to the coordinator a reviewer A in `route.json` other than the brief's.

#### Scenario: Before pass 1
- **WHEN** a worker has committed the implementation of a change
- **THEN** it runs the route command and commits `route.json`, then runs `make verify`, `make record`, and `make record-check`, and starts review pass 1

#### Scenario: Reviewer A differs from the brief
- **WHEN** `route.json` names another reviewer A than the brief
- **THEN** the worker reviews with the brief's reviewers and reports the difference to the coordinator

#### Scenario: Elevated effort before authorization
- **WHEN** `route.json` recommends the `elevated` tier and no governance change has authorized its efforts
- **THEN** the worker reviews at today's configured effort and `route.json` keeps the recommendation

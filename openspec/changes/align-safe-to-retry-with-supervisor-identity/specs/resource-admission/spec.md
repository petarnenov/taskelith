## MODIFIED Requirements

### Requirement: Quotas and budgets
Placement SHALL charge the project quota, the attempt's run quota, its root's run quota, and each provider credential it holds, wait on an exhausted quota or credential, reject a placement beyond 8 attempts in a task tree or beyond 2 automatic retries, and give an automatic retry no allowance unless the earlier attempt ended `not-started` or `exited` with a proven start and a known status and released its reservation; a later reservation of an attempt SHALL charge nothing.

#### Scenario: Exhausted quota
- **WHEN** a run quota of 1 is held and another attempt of the run is placed
- **THEN** it waits with `run-quota-exhausted`

#### Scenario: Placed again
- **WHEN** a cancelled assignment's attempt is placed again
- **THEN** the new reservation is held and the attempt's charge is not repeated

#### Scenario: Retry of an unknown exit
- **WHEN** an automatic retry is placed after an earlier attempt that exited with an unknown status after a proven start
- **THEN** it is rejected with `retry-budget-exhausted`

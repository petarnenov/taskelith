## ADDED Requirements

### Requirement: Scenario result records
The harness SHALL build a scenario's result with `scenario`, `seed`, `rerunHint`, `host`, `arch`, `commit`, `target`, `outcome`, an optional `detail`, and `recordedAt`, where `target` is `harness-composition` or `compose-installation` and `outcome` is `passed` or `failed`, and SHALL reject a scenario name that is not lowercase words joined by hyphens, a seed that is not an integer from 0 to 2^32 − 1, and any other target or outcome.

#### Scenario: Record a result
- **WHEN** a file recorder with host `Darwin 25.6.0`, architecture `arm64`, and commit `f9ba7a5` records the run `worker-disk-loss` with seed 1234, target `compose-installation`, and outcome `passed`
- **THEN** the file gains one JSON line with those values, `rerunHint` `rerun with TASKELITH_TEST_SEED=1234`, and the recording time

#### Scenario: Malformed run
- **WHEN** a run has the outcome `uncertain` or the seed −1
- **THEN** recording it fails and nothing is written

### Requirement: Opt-in scenario results file
`scenarioRecorderFromEnvironment` SHALL append each result as one JSON line to the file that `TASKELITH_SCENARIO_RESULTS` names, resolved against the working directory, with the commit from `git rev-parse HEAD`, and SHALL record nothing when the variable is unset or empty.

#### Scenario: Evidence run
- **WHEN** `TASKELITH_SCENARIO_RESULTS` is `results.jsonl` and a scenario records a run
- **THEN** `results.jsonl` in the working directory gains one line whose `commit` is the `HEAD` commit

#### Scenario: Ordinary test run
- **WHEN** `TASKELITH_SCENARIO_RESULTS` is unset and a scenario records a valid run
- **THEN** no file is written

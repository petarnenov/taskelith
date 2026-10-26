## MODIFIED Requirements

### Requirement: Scenario result records
The harness SHALL build a scenario's result with `scenario`, `seed`, `rerunHint`, `host`, `arch`, `commit`, `target`, `outcome`, an optional `detail`, and `recordedAt`, where `target` is `harness-composition`, `compose-installation`, `host-test-suite`, or `linux-test-container` and `outcome` is `passed` or `failed`, and SHALL reject a malformed scenario name (not lowercase words joined by hyphens), a seed that is not an integer from 0 to 2^32 − 1, and any other target or outcome.

#### Scenario: Record a result
- **WHEN** a file recorder with host `Darwin 25.6.0`, architecture `arm64`, and commit `f9ba7a5` records the run `worker-disk-loss` with seed 1234, target `compose-installation`, and outcome `passed`
- **THEN** the file gains one JSON line with those values, `rerunHint` `rerun with TASKELITH_TEST_SEED=1234`, and the recording time

#### Scenario: Malformed run
- **WHEN** a run has the outcome `uncertain` or the seed −1
- **THEN** recording it fails and nothing is written

#### Scenario: Result without an acceptance context
- **WHEN** the run environment has no acceptance context
- **THEN** the result has no `acceptance` field, as before this change

## ADDED Requirements

### Requirement: Acceptance context from the environment
`runEnvironment` SHALL read `TASKELITH_ACCEPTANCE`, when set and nonempty, as a JSON acceptance context, SHALL fail on a malformed one, and every result recorded with that environment SHALL carry the context as `acceptance`.

#### Scenario: Acceptance run
- **WHEN** `TASKELITH_ACCEPTANCE` holds a valid context and a scenario records a run
- **THEN** its result carries that context as `acceptance`

### Requirement: Acceptance context fields
An acceptance context SHALL name a matrix entry (`linux-ubuntu-24.04-x86_64`, `linux-ubuntu-24.04-arm64`, `macos-26-x86_64`, or `macos-26-arm64`), a G2 acceptance row (`service-lifecycle`, `process-ownership`, `journal-and-storage`, `cancellation`, or `connectivity`), a nonempty `proof`, and a `platform` with nonempty `os`, `architecture`, `kernel`, `filesystem`, `node`, and `docker`.

#### Scenario: Malformed context
- **WHEN** `TASKELITH_ACCEPTANCE` names the row `resource-budgets`
- **THEN** building the run environment fails, naming the allowed rows

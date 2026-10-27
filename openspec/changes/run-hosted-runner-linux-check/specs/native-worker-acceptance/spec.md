## ADDED Requirements

### Requirement: Hosted-runner Linux x86_64 check
A workflow that runs only on manual dispatch SHALL run the Linux entry of `make native-acceptance` on a GitHub-hosted `ubuntu-24.04` runner, with read-only repository contents, no secrets, and every action pinned by full commit SHA. It SHALL upload the results file and the run log even when a step fails, and SHALL fail when any proof fails.

#### Scenario: Every proof passes
- **WHEN** the workflow is dispatched and every proof of the Linux entry passes
- **THEN** the run succeeds and its artifact holds `results.jsonl` and `run.log`

#### Scenario: A proof fails
- **WHEN** one proof of the Linux entry fails
- **THEN** the run fails and its artifact still holds `results.jsonl` and `run.log`

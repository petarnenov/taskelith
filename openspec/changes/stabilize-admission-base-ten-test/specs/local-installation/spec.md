## MODIFIED Requirements

### Requirement: Bounded admission wait of the bring-up check
Each admission wait of `make verify-installation` SHALL read the workers view through the administrative entry and SHALL fail as a timeout when the worker is not admitted within `TASKELITH_ADMISSION_SECONDS`, a positive whole number of seconds read in base 10, by default 300, killing a read still running then. A wait SHALL NOT end as a timeout before that whole bound has passed since it started. Any other value SHALL be a usage error before any read.

#### Scenario: Admission timeout
- **WHEN** the worker is still `awaiting-self-check` when the bound ends
- **THEN** the check fails and says that the worker was not admitted within the bound

#### Scenario: Hung read
- **WHEN** a read of the workers view is still running when the bound ends
- **THEN** the read is killed and the check fails as a timeout

#### Scenario: Clock tick right after the start
- **WHEN** a read hangs and the shell's whole-second clock ticks right after the wait starts
- **THEN** the check fails as a timeout only after the whole bound has passed

#### Scenario: Bound of zero
- **WHEN** `TASKELITH_ADMISSION_SECONDS` is `0`
- **THEN** the check fails as a usage error without reading the workers view

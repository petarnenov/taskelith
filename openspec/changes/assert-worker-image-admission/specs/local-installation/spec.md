## MODIFIED Requirements

### Requirement: Opt-in bring-up check
`make verify-installation` SHALL build the images, bootstrap, start, and enroll a throwaway installation with random secrets, wait until its worker is `admitted` with `linux-containment` `passed`, restart it, wait for that again from a report of the new start, and remove it with its volumes. `make verify` SHALL check the composition and the Dockerfile without building or starting them. A failed check SHALL print the control-plane log before it removes the project.

#### Scenario: Successful check
- **WHEN** `make verify-installation` runs on a Docker host
- **THEN** the worker enrolls and is `admitted` with `linux-containment` `passed` before and after the restart, every service runs after the restart, and the project is removed

#### Scenario: Failed check
- **WHEN** a step of `make verify-installation` fails
- **THEN** the control-plane log is printed, and the project is removed

## ADDED Requirements

### Requirement: Bounded admission wait of the bring-up check
Each admission wait of `make verify-installation` SHALL read the workers view through the administrative entry and SHALL fail at once on `self-check-failed`, printing each failed check ID with its redacted details, on a refused read, and on an admission without a passed `linux-containment` check. It SHALL fail as a timeout when the worker is not admitted within `TASKELITH_ADMISSION_SECONDS` seconds in base 10, by default 300, and SHALL kill a read still running then.

#### Scenario: Failed self-check
- **WHEN** the workers view shows the worker `self-check-failed` with a failed `linux-containment` result
- **THEN** the check fails without another read and prints `linux-containment` with its details

#### Scenario: Admission timeout
- **WHEN** the worker is still `awaiting-self-check` when the bound ends
- **THEN** the check fails and says that the worker was not admitted within the bound

#### Scenario: Hung read
- **WHEN** a read of the workers view is still running when the bound ends
- **THEN** the read is killed and the check fails as a timeout

#### Scenario: Containment check not run
- **WHEN** the worker is `admitted` with `linux-containment` `not-applicable`
- **THEN** the check fails

#### Scenario: Report of the earlier start
- **WHEN** the wait after the restart sees only the report consumed before the restart
- **THEN** it keeps waiting for a report of the new start

## ADDED Requirements

### Requirement: Worker admission view
The Fleet module SHALL provide an installation-scoped read model that returns, with its `asOf`, every enrolled worker that is not revoked, in identifier order, with its host, enrollment time, worker admission state, the time of its last consumed self-check report, and each stored check result with its outcome and details. It SHALL hold no credential or credential hash, and SHALL fail with `unavailable` rather than return partial data.

#### Scenario: Failed check shown
- **WHEN** a worker's last report named a failed check
- **THEN** the view shows the worker as `self-check-failed` with that check, its outcome, and its problems

#### Scenario: Worker without a report
- **WHEN** a worker has no consumed report
- **THEN** the view shows it as `awaiting-self-check` with no report time and no results

## ADDED Requirements

### Requirement: Epoch gate before effects
Before the effect of an exit, `not-started`, `uncertain`, `termination-unproven`, or `cancellation.not-applied`, the control plane SHALL check the observation's recovery epoch and the quarantine state with the execution module's start-observation check. An observation outside the current epoch, or in quarantine, SHALL be applied without effect, confirmed, and logged as `execution.observation.evidence`.

#### Scenario: Old-epoch exit beside a current one
- **WHEN** after a restore one execution's exit arrives at the earlier epoch and another execution's exit at the current epoch
- **THEN** the first ends nothing, keeps the reservation, and is confirmed and logged; the second ends its attempt and releases it

#### Scenario: Evidence in quarantine
- **WHEN** `uncertain`, `termination-unproven`, `cancellation.not-applied`, and `not-started` observations arrive at the current epoch during restore quarantine
- **THEN** each is confirmed and logged, the task is unchanged, and a repeat of one after the quarantine is a duplicate without effect

#### Scenario: Unrecorded process at an older epoch
- **WHEN** an unrecorded process is reported at an epoch older than the current one
- **THEN** it is recorded for the reconciliation queue, and its warning names its epoch

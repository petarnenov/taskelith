## MODIFIED Requirements

### Requirement: Authenticated producer
An observation SHALL be applied only when its subject names its `metadata.workerId`, that worker is enrolled, and its `journalId` is the worker's enrolled journal and not retired, or, for a worker that is not revoked, a journal never seen from that worker that replaces the enrolled one as a new journal incarnation; otherwise it SHALL NOT be applied. An observation of a revoked worker SHALL be applied under the requirement for observations of a revoked worker in `launch-reconciliation`.

#### Scenario: Worker in the body differs from the subject
- **WHEN** an observation on worker A's subject names worker B
- **THEN** it is not applied, and no contact is recorded for either worker

#### Scenario: Unknown journal
- **WHEN** an enrolled worker's observation names a journal other than its enrolled one that the control plane saw from that worker before
- **THEN** it is not applied, and its sequence is not recorded

## REMOVED Requirements

### Requirement: Observations left to later changes
**Reason**: 21d consumes `execution.started`, `execution.launch.rejected`, and the observations of a revoked worker.
**Migration**: See the `launch-reconciliation` capability.

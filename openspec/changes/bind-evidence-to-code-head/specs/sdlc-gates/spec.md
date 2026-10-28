## ADDED Requirements

### Requirement: Head-bound gates
A gate opened with a code head SHALL be head-bound, and every transition SHALL keep its code head except `reopenGateAtCodeHead`, which replaces the subject and the code head. After the generation and transition checks, `reopenGate` SHALL reject a head-bound gate and `reopenGateAtCodeHead` a gate without a code head, both with `precondition-failed`.

#### Scenario: Reopen without a code head
- **WHEN** a stale head-bound gate is reopened with `reopenGate`
- **THEN** the reopen is rejected with code `precondition-failed` and the gate stays stale

### Requirement: Evidence bound to the code head
Evidence SHALL decide a head-bound gate only when its code head equals the gate's code head in repository, commit, and tree; evidence of another head or without a code head SHALL be rejected with `precondition-failed`. A gate without a code head SHALL be decided whatever code head the evidence names.

#### Scenario: Evidence from another head
- **WHEN** an approval of the gate's subject names another repository, another commit, or no code head
- **THEN** recording it is rejected with code `precondition-failed` and the gate stays pending

### Requirement: Invalidation by a new code head
A code head SHALL outdate a gate exactly when the gate is head-bound and the head differs from the gate's code head in repository, commit, or tree. `markGateStaleByCodeHead` SHALL be rejected with `precondition-failed` when the head does not outdate the gate, and the stale gate SHALL keep its code head and its decision.

#### Scenario: New head after approval
- **WHEN** a passed head-bound gate is marked stale by a new commit whose tree equals the reviewed one
- **THEN** the gate is stale and keeps the superseded approval and the reviewed code head

#### Scenario: Same head
- **WHEN** a passed head-bound gate is marked stale by its own code head
- **THEN** the change is rejected with code `precondition-failed` and the gate stays passed

### Requirement: Approval not restored by an artifact edit
An artifact revision SHALL never pass a gate. A stale head-bound gate SHALL pass again only after `reopenGateAtCodeHead` and new evidence at the head it was reopened for, so an edit that restores the reviewed content in a new commit SHALL NOT make the superseded approval decide the gate.

#### Scenario: Edit reverted
- **WHEN** a gate approved at one head goes stale for a later commit, and a third commit restores the reviewed content and the gate is reopened at it
- **THEN** recording the superseded approval is rejected with code `precondition-failed`, and an approval at the third commit passes the gate

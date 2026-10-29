## REMOVED Requirements

### Requirement: New-session selection in the placement transaction
**Reason**: Sub-change 12b selects `resumed-session` and `after-limit` requests, so the refusal of those kinds with `invalid` until 12b, and its scenario, end.
**Migration**: "Slot request in the placement transaction" keeps the rest of the requirement and its other two scenarios; "Resumed-session selection in the placement transaction" and "After-limit selection in the placement transaction" select the other kinds.

## ADDED Requirements

### Requirement: Slot request in the placement transaction
`placeInTransaction` SHALL take the attempt's slot request instead of provider credentials, SHALL fail with `invalid` a request for a project other than the task's, SHALL select a `new-session` request's slot by eligibility, the least-loaded rule, and its policy at the credential step, and SHALL record the selected slot and its reservation time with the reservation.

#### Scenario: Race for the last unit of a slot
- **WHEN** two placements on PostgreSQL race for the last unit of a slot whose concurrency limit is 1
- **THEN** one is placed and the other waits with `provider-concurrency-exhausted`

#### Scenario: Request for another project
- **WHEN** a placement's slot request names a project other than the project of the task's lineage
- **THEN** the placement fails with `invalid`, and no reservation, worker command, or slot write is made

### Requirement: Resumed-session selection in the placement transaction
`placeInTransaction` SHALL select for a `resumed-session` request only the session's own stored slot: it SHALL reserve the slot when eligible, wait with `provider-concurrency-exhausted` when it is unhealthy, cooling down, or at its concurrency limit, reject with `session-slot-withdrawn` when it is revoked, removed, or not allowed for the project, and fail with `invalid` when the request names another harness for it.

#### Scenario: Own slot more loaded than another
- **WHEN** a resumed session's eligible slot holds two reservations and another slot of its harness holds none
- **THEN** the session's own slot is reserved and the other slot is not written

#### Scenario: Own slot cooling down
- **WHEN** a resumed session's slot is cooling down
- **THEN** the placement waits with `provider-concurrency-exhausted`, and no reservation or slot write is made

#### Scenario: Another harness named for the slot
- **WHEN** a `resumed-session` request names a harness other than its stored slot's
- **THEN** the placement fails with `invalid` and reserves nothing

#### Scenario: Race with a new session on PostgreSQL
- **WHEN** a resumed session and a new session race on PostgreSQL for the last unit of the resumed session's slot, both reading it free first
- **THEN** one is placed, and the other is retried and waits with `provider-concurrency-exhausted`

### Requirement: After-limit selection in the placement transaction
`placeInTransaction` SHALL select for an `after-limit` request the least-loaded eligible slot of the first alternative harness, in the given order, that has one, else the limited slot once it is eligible, and else SHALL wait with `provider-concurrency-exhausted`; it SHALL read no pool of the limited harness and SHALL fail with `invalid` when the request names another harness for the limited slot.

#### Scenario: Other slot of the limited harness
- **WHEN** the limited slot is cooling down, another slot of the limited harness is eligible, and no alternative harness has an eligible slot
- **THEN** the placement waits with `provider-concurrency-exhausted` and neither slot is written

#### Scenario: Cooldown ended
- **WHEN** no alternative harness has an eligible slot and the limited slot's cooldown ended at the selection time
- **THEN** the limited slot is reserved

#### Scenario: Race for an alternative's last unit on PostgreSQL
- **WHEN** two `after-limit` placements race on PostgreSQL for the last unit of an alternative harness's slot while the limited slot cools down
- **THEN** one reserves that slot, the other is retried and waits, and the limited harness's other slot is not written

### Requirement: Limit signal applied to the reserving slot
`applySlotLimitInTransaction` SHALL apply a plugin's parsed `limit` event, in the caller's SERIALIZABLE capacity transaction, by compare-and-set to the one slot that the named assignment's reservation records: a cooldown until the reported reset when it is after the database time, else for the caller's default of 1 to 1440 minutes, never shortening the stored one, rereading the slot after a lost compare-and-set.

#### Scenario: Reported reset
- **WHEN** a limit with a reset time one and a half hours after the database time is applied
- **THEN** the slot cools down until that time with the source `reported-reset`

#### Scenario: Reset time not in the future
- **WHEN** a limit without a reset time, or with one at or before the database time, is applied with a default of 60 minutes
- **THEN** the slot cools down for 60 minutes with the source `default`

#### Scenario: Shorter later limit
- **WHEN** a limit whose cooldown would end before the slot's stored cooldown is applied
- **THEN** the stored cooldown and the slot's revision stay

#### Scenario: Reservation without one slot
- **WHEN** a limit names an assignment whose reservation records no slot or two slots
- **THEN** it fails with `precondition-failed` and no slot is written

#### Scenario: Two limits racing on PostgreSQL
- **WHEN** two limits with different reset times are applied on PostgreSQL to one slot, both reading it first
- **THEN** one is retried, and the slot cools down until the later reset time

#### Scenario: Limit racing a placement on PostgreSQL
- **WHEN** a limit and a new session's placement that selects the same slot race on PostgreSQL, both reading the slot first
- **THEN** the second to commit is retried, and the placement is placed only when it committed before the limit

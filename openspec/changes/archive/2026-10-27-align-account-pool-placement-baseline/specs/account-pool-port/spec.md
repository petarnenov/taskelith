## ADDED Requirements

### Requirement: Slot selection at the credential step
Slot selection SHALL replace the caller-supplied credentials inside the placement transaction and SHALL decide its credential step, after the worker and quota checks and before the charge check, against the selected slot's own concurrency limit. A wait SHALL be `provider-concurrency-exhausted`, which tries no other worker and is no fleet capacity decline; a rejection SHALL end the attempt with a `rejected` record.

#### Scenario: Limit other than the default
- **WHEN** a slot whose concurrency limit is 8 holds 4 reservations and is the only eligible slot
- **THEN** the next attempt reserves it

#### Scenario: Rejecting policy behind a full quota
- **WHEN** a `new-session` request with the `reject` policy finds no eligible slot while the project quota is full
- **THEN** the task waits with `project-quota-exhausted` and its attempt is not rejected

#### Scenario: Slot wait in a pass
- **WHEN** a task's selection waits while workers have room
- **THEN** the task backs off with a `waiting` record of `provider-concurrency-exhausted`, and the pass offers the next task

### Requirement: Single slot write per placement
A selection SHALL only read; the slot's reservation time SHALL be written only with the insert of the reservation, so a candidate declined for a reason about its worker SHALL leave no slot write.

#### Scenario: Declined first candidate
- **WHEN** the first candidate worker is full and the second accepts the attempt
- **THEN** the selected slot is written once, with the reservation on the second worker

### Requirement: Serializable slot changes
Every slot change SHALL run at serializable isolation, because the reservation transaction reads slots: adding a slot, a load, limit, reset, or health signal, a change of the allowed projects or the concurrency limit, a revocation, reinstatement, or removal, and a rotation's switch and revision advance.

#### Scenario: Revocation racing a selection
- **WHEN** a slot's revocation and a reservation that selects the slot run concurrently
- **THEN** the reservation commits only in an order where the slot was still active

## MODIFIED Requirements

### Requirement: Deterministic least-loaded order
The least-loaded rule SHALL order eligible slots by held reservations, then by usage fraction only when every tied slot reports one within its current window, then by least recent reservation, then by lowest identifier, and the insert of the reservation SHALL record the time of the slot's reservation.

#### Scenario: Equal usage
- **WHEN** two eligible slots tie on held reservations and report the same usage fraction
- **THEN** the least recently reserved of the two is reserved

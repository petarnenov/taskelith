## ADDED Requirements

### Requirement: Slot listing
`AccountSlots.list(after, limit)` SHALL return at most `limit` slots in every state, removed ones included, and `listForProject(projectId, after, limit)` at most `limit` active slots of any harness that allow the project; both SHALL order by identifier in code-unit order, start after `after`, and pass their conformance case in both adapters.

#### Scenario: Listing order and states
- **WHEN** slots whose identifiers differ in case are active, revoked, and removed
- **THEN** `list` names all of them in code-unit order, and `listForProject` only the active ones that allow the project

## MODIFIED Requirements

### Requirement: Slot commands besides adding
The pool SHALL update a slot's allowed projects or concurrency limit, revoke, reinstate, remove, and rotate a slot by compare-and-set on the caller's expected revision in `SERIALIZABLE` transactions. A removed or unknown slot SHALL fail with `not-found`, then another stored revision with `conflict`; a repeat that changes nothing SHALL return the slot unchanged; an update of a revoked slot or a rotation of an active one SHALL fail with `conflict`.

#### Scenario: Repeated revocation or reinstatement
- **WHEN** an operator revokes a revoked slot or reinstates an active one at its current revision
- **THEN** the command succeeds, writes nothing, and returns the slot at its current revision

#### Scenario: Moved revision
- **WHEN** an operator runs any of these commands with a revision other than the stored one
- **THEN** the command fails with `conflict`, writes nothing, and a rotation stores no credential

#### Scenario: Update of a revoked slot
- **WHEN** an operator changes the allowed projects or the concurrency limit of a revoked slot
- **THEN** the update fails with `conflict` and the slot is unchanged

#### Scenario: Command on a removed slot
- **WHEN** an operator updates, revokes, reinstates, removes, or rotates a removed or unknown slot
- **THEN** the command fails with `not-found`

#### Scenario: Rotation answer
- **WHEN** a rotation's switch commits and its cleanup then fails
- **THEN** the rotation returns the slot at the revision of its switch, and the sweep later discards the replaced version

#### Scenario: Removal whose destroy fails
- **WHEN** a removal commits and the destroy of its credential then fails
- **THEN** the removal succeeds, and the sweep later destroys every version of the slot

#### Scenario: Revocation racing a placement
- **WHEN** a revocation and a placement that selects its slot run concurrently on PostgreSQL
- **THEN** both commit only in a serial order, the later one is retried, and no held reservation names the revoked slot

#### Scenario: Revocation racing a re-delivery
- **WHEN** a revocation and a re-delivery of its slot's credential read the active slot concurrently on PostgreSQL
- **THEN** both commit as if the re-delivery ran first, and the revocation cancels the attempt and revokes its grant

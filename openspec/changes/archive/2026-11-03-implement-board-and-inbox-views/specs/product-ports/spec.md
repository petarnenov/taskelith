## ADDED Requirements

### Requirement: Card store
The Execution module SHALL keep a card per root run in a `CardCatalog` port, with its project, a title of 1 to 200 code points without a control character or an unpaired surrogate, a work type, and its creation time; a run without a card SHALL not be on the board, registering a known run SHALL answer `conflict`, and the port SHALL list a card's tasks in admission order, each delegated child under its parent. Task intake writes the cards; until it does, every board is empty.

#### Scenario: A run without a card
- **WHEN** a workflow run of the project has no card
- **THEN** the board does not show it, and its task detail answers not-found

#### Scenario: A card registered twice
- **WHEN** a card is registered for a run that already has one
- **THEN** the register answers `conflict` and the first card stays

### Requirement: Merge gate before the merge queue
Until a merge queue adapter is built, the board SHALL read the merge gate through an empty merge queue that never reports a request, so `integration` is `not-ready` before merge readiness and, once ready, `ready` with auto-merge on and `awaiting-manual-merge` with it off.

#### Scenario: A merge-ready card with auto-merge off
- **WHEN** every pre-merge stage of a card passed and the project's auto-merge is off
- **THEN** its `integration` is `awaiting-manual-merge` and it waits for a person

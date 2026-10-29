## ADDED Requirements

### Requirement: Held output tail on the wire
Wire contracts section 7 SHALL state that a held tail belongs to its turn and is released, redacted, before the turn's outcome or its generation's end is recorded, that it never exceeds `MAX_HARNESS_TEXT_LENGTH` code units, and how a run past that bound is recorded.

#### Scenario: Tail never served
- **WHEN** a client reads output while a turn holds a tail
- **THEN** the answer carries only released entries, and none of the held text

## MODIFIED Requirements

### Requirement: Output after a cursor on the wire
`readAgentSessionOutput` SHALL return at most 100 retained entries after its cursor in position order with a `next` position, the last entry's, while more remain, `cursor-expired` with the earliest retained position for a cursor older than the retained window, and 400 for a cursor after the last position.

#### Scenario: Expired output cursor
- **WHEN** a client reads output after a position that left the retained window
- **THEN** the answer is `cursor-expired` with the earliest retained position

#### Scenario: Window trimmed between pages
- **WHEN** a client follows `next` after the window trimmed past it
- **THEN** the answer is `cursor-expired` with the earliest retained position

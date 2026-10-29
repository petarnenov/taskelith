## ADDED Requirements

### Requirement: Held output tail on the wire
Wire contracts section 7 SHALL state that a turn's output is redacted as one text with a held tail that belongs to its turn, is stored only sealed, and is released, redacted, before the turn's outcome or its generation's end is recorded, and that a held part past `MAX_HARNESS_TEXT_LENGTH` code units is recorded as one marker with its continuation dropped, an open block's up to the end marker of its own kind.

#### Scenario: Tail never served
- **WHEN** a client reads output while a turn holds a tail
- **THEN** the answer carries only released entries, and none of the held text

## MODIFIED Requirements

### Requirement: Event payloads and session text
An event's data SHALL be the record, or for `board-changed` the field, that the corresponding read returns for the same state, and the control plane SHALL redact session text with `@taskelith/secrets` before it records it, a turn's output as one text across its chunks, so that a read and an event carry the same redacted text.

#### Scenario: Secret in agent output
- **WHEN** a harness writes output that holds a credential of a known shape
- **THEN** neither the output read nor its `output-appended` event carries the credential

#### Scenario: Secret split across output chunks
- **WHEN** a harness writes a credential of a known shape in two output chunks
- **THEN** neither the output read nor any `output-appended` event carries the credential or a part of it that could rebuild it

### Requirement: Output after a cursor on the wire
`readAgentSessionOutput` SHALL return at most 100 retained entries after its cursor in position order with a `next` position, the last entry's, while more remain, `cursor-expired` with the earliest retained position for a cursor older than the retained window, and 400 for a cursor after the last position.

#### Scenario: Expired output cursor
- **WHEN** a client reads output after a position that left the retained window
- **THEN** the answer is `cursor-expired` with the earliest retained position

#### Scenario: Window trimmed between pages
- **WHEN** a client follows `next` after the window trimmed past it
- **THEN** the answer is `cursor-expired` with the earliest retained position

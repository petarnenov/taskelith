## ADDED Requirements

### Requirement: Output redacted across chunks
The service SHALL hold back the tail of a turn's output that could still be the start or a part of a secret of a known shape, keep it durably apart from the session, never show it, and record only released text, redacted, so that the released parts of a turn joined equal the redaction of its whole output while no tail passes its bound.

#### Scenario: Secret split across chunks
- **WHEN** a harness writes a secret of a known shape in two or three chunks, split at any offset
- **THEN** the turn's stored output equals the redaction of the whole text and holds no part of the secret

#### Scenario: Restart with a held tail
- **WHEN** the control plane restarts after a chunk that holds half a secret committed
- **THEN** no read shows any part of it, and the next chunk records the secret redacted

### Requirement: Held tail bound
The held tail SHALL never exceed `MAX_HARNESS_TEXT_LENGTH` UTF-16 code units: past the bound the oldest part SHALL be released, never inside a surrogate pair, and the released part of a run of non-whitespace characters longer than the bound, and its continuation up to the next whitespace, SHALL be recorded as markers.

#### Scenario: Tail at the bound
- **WHEN** a held tail reaches exactly `MAX_HARNESS_TEXT_LENGTH` code units
- **THEN** nothing of it is released

#### Scenario: Secret at the forced cut
- **WHEN** a run without whitespace passes the bound with a JWT across the forced cut
- **THEN** no stored entry holds any part of the JWT

### Requirement: Held tail released at its turn's end
The service SHALL release a held tail, redacted, as entries of its own turn in the transaction that records its turn's outcome, its acceptance unknown, its generation's end, or its bound attempt's end, before that change, also when recovery records it.

#### Scenario: Generation ends with a tail
- **WHEN** a generation ends while its turn holds a tail with half a secret
- **THEN** the tail is recorded redacted as the turn's last entry, and the session keeps no tail

### Requirement: Released output split into entries
The service SHALL record released text longer than `MAX_HARNESS_TEXT_LENGTH` as consecutive entries of at most that many code units, split on whole characters, losing none of it.

#### Scenario: Release past the entry bound
- **WHEN** a release holds more than `MAX_HARNESS_TEXT_LENGTH` code units with a surrogate pair at the split
- **THEN** it is recorded as two entries, the pair whole in the second

### Requirement: Output read in pages
The service SHALL read a session's retained output after a cursor in one transaction, returning at most a page of entries in position order and whether more remain, `cursor-expired` with the earliest retained position for a cursor older than the window, and `invalid` for a cursor past the last position.

#### Scenario: Page of output
- **WHEN** a reader asks for 100 entries after a cursor with 101 retained after it
- **THEN** it receives the first 100 in order and that more remain

## MODIFIED Requirements

### Requirement: Redacted text cut to its bound
After redaction, the service SHALL cut only the tail of a text that redaction lengthened past its bound, on a whole character: an input answer to `MAX_INPUT_ANSWER_BYTES` UTF-8 bytes, which it SHALL also check before redaction, and every other text except output to `MAX_HARNESS_TEXT_LENGTH`, never inside a surrogate pair, so that a text within its bound is never refused.

#### Scenario: Turn text that redaction lengthens
- **WHEN** a turn's text within its bound redacts to a text past the bound, with a surrogate pair at the cut
- **THEN** the turn is recorded with the redacted text cut before that pair

## REMOVED Requirements

### Requirement: No output read before cross-chunk redaction
**Reason**: Output is now redacted across chunks with a held tail, so the service reads it ("Output read in pages").
**Migration**: Read output through `SessionTimelineService.readOutput` or `readAgentSessionOutput`.

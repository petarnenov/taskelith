## ADDED Requirements

### Requirement: Output redacted across chunks
The service SHALL hold back the tail of a turn's output that could still be the start or a part of a secret of a known shape, keep it durably apart from the session, never show it, and record only released text, redacted, so that the released parts of a turn joined equal the redaction of its whole output while no held part passes its bound and the turn does not end inside an open block or a secret cut short.

#### Scenario: Secret split across chunks
- **WHEN** a harness writes a secret of a known shape in two or three chunks, split at any offset, and no held part passes the bound
- **THEN** the turn's stored output equals the redaction of the whole text and holds no part of the secret

#### Scenario: Restart with a held tail
- **WHEN** the control plane restarts after a chunk that holds half a secret committed
- **THEN** no read shows any part of it, and the next chunk records the secret redacted

### Requirement: Held tail bound
The held tail SHALL never exceed `MAX_HARNESS_TEXT_LENGTH` UTF-16 code units: a held part past the bound SHALL be recorded as one marker, and a durable flag SHALL drop its continuation, a run's up to the next whitespace and an open PEM key's or `.creds` block's up to the end marker of its own kind, so that nothing of a cut secret is released.

#### Scenario: Tail at the bound
- **WHEN** a held run reaches exactly `MAX_HARNESS_TEXT_LENGTH` code units
- **THEN** nothing of it is released

#### Scenario: Secret at the forced cut
- **WHEN** a run without whitespace passes the bound with a JWT across the cut
- **THEN** the run and its continuation are recorded as one marker, and no stored entry holds any part of the JWT

#### Scenario: End marker of another kind
- **WHEN** a `.creds` block passes the bound, and a PEM key end marker, more text, and the block's own end marker follow
- **THEN** everything up to the block's own end marker is dropped, and only the text after it is released

#### Scenario: Key begun in a block past the bound
- **WHEN** a `.creds` block passes the bound, and a key begin marker with a long type is cut inside it so that the block's context and the cut marker pass the bound
- **THEN** the key is taken as open, so a `.creds` end marker inside the key ends nothing, and no byte of the key's body is released

#### Scenario: Key longer than the bound
- **WHEN** a PEM private key longer than the bound is written in chunks
- **THEN** it is recorded as one marker, and the text after its end marker is released

### Requirement: Held tail sealed at rest
The service SHALL store a held tail only as AES-256-GCM ciphertext under the session output tail key, with the session, the turn, and the tail's version as authenticated data, and SHALL fail with `internal`, releasing nothing, for a tail that does not open.

#### Scenario: Tail at rest
- **WHEN** a chunk that holds half a secret commits
- **THEN** no stored byte of the output or tail tables holds any part of it

#### Scenario: Changed ciphertext
- **WHEN** a stored tail's ciphertext or turn is changed
- **THEN** the next append fails with `internal`, and no entry is recorded

### Requirement: Session output tail key
The service SHALL refuse to start when the output tail key file is missing or its key is not 32 bytes, with a reason that holds no key byte; the key file SHALL be created with mode `0600`, and no log or record SHALL carry the key.

#### Scenario: Wrong-size tail key
- **WHEN** the tail key file holds a key of another size
- **THEN** the service does not start, and the reason names only the size

### Requirement: Held tail released at its turn's end
The service SHALL release a held tail, redacted, with an open block, and the trailing run's earliest suffix that may still be a secret of a known shape, down to one character of a shape's head, as one marker, as entries of its own turn in the transaction of any change that ends the turn, such as its outcome, its generation's end, or its bound attempt's end, before that change, also when recovery records it.

#### Scenario: Generation ends with a tail
- **WHEN** a generation ends while its turn holds a tail with half a secret
- **THEN** the tail is recorded redacted as the turn's last entry, and the session keeps no tail

#### Scenario: Turn ends inside a secret
- **WHEN** a turn ends, also through recovery, while its tail holds a JWT cut short after its first dot
- **THEN** the JWT is recorded as one marker, and no stored entry holds any part of it

#### Scenario: Turn ends in a shape's head
- **WHEN** a turn's output ends without whitespace in a non-empty prefix of a shape's head, such as `e`, `tko`, or `SO`
- **THEN** that prefix is recorded as one marker, while a run one character past every head, such as `tkopz`, is kept

### Requirement: Released output split into entries
The service SHALL record released text longer than `MAX_HARNESS_TEXT_LENGTH` as consecutive entries of at most that many code units, split on whole characters, losing none of it.

#### Scenario: Release past the entry bound
- **WHEN** a release holds more than `MAX_HARNESS_TEXT_LENGTH` code units with a surrogate pair at the split
- **THEN** it is recorded as two entries, the pair whole in the second

### Requirement: Output read in pages
The service SHALL read a session's retained output after a cursor in one transaction, returning at most a page of entries in position order and whether more remain, `cursor-expired` with the earliest retained position for a cursor older than the window, and `invalid` for a cursor past the last position.

#### Scenario: Page of output
- **WHEN** a reader asks for 2 entries after a cursor with 3 retained after it
- **THEN** it receives the first 2 in order and that more remain

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

## ADDED Requirements

### Requirement: Output redacted across chunks
The service SHALL redact a generation's output as one text, holding back durably the raw tail that could still be part of a secret, at most `MAX_HARNESS_TEXT_LENGTH` code units, and releasing it redacted when a later chunk decides it, the turn ends, or the generation ends, also after a restart.

#### Scenario: Token split across chunks
- **WHEN** a JWT arrives split across two output chunks
- **THEN** no output entry, read, or stored entry holds any part of it

#### Scenario: Restart with a held tail
- **WHEN** the control plane restarts while a tail is held, and the next chunk completes a secret
- **THEN** the secret is released redacted, and no part of it was released before

### Requirement: Released output split, never cut
The service SHALL record released output as entries of at most `MAX_HARNESS_TEXT_LENGTH` code units each, split on a code point boundary, so that no released text is lost.

#### Scenario: Redaction lengthens a release
- **WHEN** redaction makes a released text longer than one entry's bound
- **THEN** it is recorded as two entries whose texts join to it, with no surrogate pair split

### Requirement: Output read
The service SHALL read a session's retained output after a cursor as the domain's `readOutputAfter` does.

#### Scenario: Read after a cursor
- **WHEN** a reader reads output after the position of the last entry it holds
- **THEN** it gets the retained entries after it in position order

### Requirement: Native request source
The native request source SHALL open a permission or input item for each recorded request of its kind and a `delivery-acknowledgement` item for each uncertain delivery, and resolve or close them in the transaction that changes the request.

#### Scenario: Response resolves the item
- **WHEN** a person answers a permission request through `respondToNativeRequest`
- **THEN** its item is resolved in the same transaction with the responder

#### Scenario: Acknowledgement sends nothing
- **WHEN** a person acknowledges a `delivery-acknowledgement` item
- **THEN** the item is resolved and audited, and no response, turn, or delivery is recorded

## REMOVED Requirements

### Requirement: No output read before cross-chunk redaction
**Reason**: Output is now redacted across chunks with a held tail, which was the condition of this requirement.
**Migration**: Replaced by "Output redacted across chunks" and "Output read" above.

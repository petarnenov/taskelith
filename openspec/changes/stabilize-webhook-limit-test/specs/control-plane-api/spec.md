## ADDED Requirements

### Requirement: Answer before the body ends
The control plane SHALL send an answer given before its request's body ended with `Connection: close`, then read and discard the rest of that body until it ends, at most 32 MiB and 10 seconds, and only then close the connection, so that a client still writing the body, such as a webhook sender over 25 MiB, reads the answer.

#### Scenario: Oversized delivery written whole
- **WHEN** a sender writes a whole delivery of 25 MiB and one byte before it reads
- **THEN** it reads the 413 with reason `body-too-large`

#### Scenario: Drain bounds
- **WHEN** the rest of the body exceeds 32 MiB or does not end within 10 seconds of the answer
- **THEN** the server closes the connection

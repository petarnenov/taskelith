## ADDED Requirements

### Requirement: Session output tail table
The adapter SHALL keep a session's held output tail in a row of its own holding only its turn, generation, version, nonce, and ciphertext, apart from the session record and its output rows, written or deleted in the session timeline transaction that appends or releases output, and read by no other path.

#### Scenario: Crash before the commit
- **WHEN** an append that holds a tail is killed at `SessionTimelineCommit.before`
- **THEN** the tail and the output rows stay as the previous commit left them

#### Scenario: Crash after the commit
- **WHEN** an append that holds half a secret is killed at `SessionTimelineCommit.after`
- **THEN** its released entry and its sealed tail are stored, and the next chunk records the secret redacted

## ADDED Requirements

### Requirement: Durable session timeline service
The session timeline service SHALL apply every change of a session through the domain in one `SERIALIZABLE` transaction and SHALL return only after that transaction committed, so that no read shows a turn, request, or response that is not committed. A held native request key SHALL change nothing when the HMAC-SHA-256 digest of its unredacted kind, turn, and text is equal and SHALL fail with `conflict` otherwise.

#### Scenario: Request committed before display
- **WHEN** the host's report of a native request is applied and the process is killed at `SessionTimelineCommit.before`
- **THEN** no read lists the request, and the repeated report records it once

#### Scenario: Request texts that redact alike
- **WHEN** a held native request key is recorded again after a restart with another text that redacts to the same text
- **THEN** the recording fails with `conflict`, and the session is unchanged

### Requirement: Text bounds checked before redaction
The service SHALL check the text of a turn, of an answer, of a native request, and of an output chunk against its bound before it redacts that text, and text outside its bound SHALL fail with `invalid` before any state is read, also when redaction would shorten it into the bound.

#### Scenario: Overlong request text with a secret
- **WHEN** the host reports a native request whose text exceeds `MAX_HARNESS_TEXT_LENGTH` only by a secret that redaction would shorten
- **THEN** the report fails with `invalid`, and no read lists the request

### Requirement: Idempotent turn submission across restarts
The service SHALL resolve a repeated turn key before the domain by an HMAC-SHA-256 digest of the author and the unredacted text: the same digest SHALL return the first turn as `duplicate`, and another digest SHALL fail with `conflict` `idempotency-key-reused`, also when both texts redact to the same text.

#### Scenario: Retry after a crash after the commit
- **WHEN** a submission is killed at `SessionTimelineCommit.after` and retried with the same key, author, and text
- **THEN** the retry returns `duplicate`, and the session holds one turn

#### Scenario: Same key from another author
- **WHEN** a key is submitted again with the same text by another author
- **THEN** the submission fails with `conflict` `idempotency-key-reused`, and no turn is added

### Requirement: Session input digest key
The service SHALL refuse to start when the digest key file is missing or its key is not 32 bytes, with a reason that holds no key byte; the key file SHALL be created once with mode `0600`, and no log or record SHALL carry the key.

#### Scenario: Wrong-size key
- **WHEN** the key file holds a key of another size
- **THEN** the service does not start, and the reason names only the size

### Requirement: No output read before cross-chunk redaction
The service SHALL show a session without its output window and SHALL expose no output read, until output is redacted across chunks.

#### Scenario: Appended output
- **WHEN** output with a secret is appended through the service
- **THEN** the store holds it redacted per chunk, and the service's answer carries no output

### Requirement: Response consumed once under concurrency
Of concurrent responses to one request, the service SHALL commit at most one; a repeat with the same response key and the same digest of the answer, the responder, and the attempt with its ownership generation SHALL return the answered request, and every other response SHALL fail as `consumeResponse` requires.

#### Scenario: Two concurrent answers on PostgreSQL
- **WHEN** two transactions answer the same open request at once under two keys
- **THEN** one commits the response, and the other fails with `conflict`

#### Scenario: Response key repeated after a crash
- **WHEN** a response is killed at `SessionTimelineCommit.after` and retried with the same key and answer
- **THEN** the retry returns the answered request, and another answer under that key fails with `conflict` `idempotency-key-reused`

### Requirement: Attempt unique across all sessions
The service SHALL bind an attempt to at most one session across all sessions, also when two bindings run concurrently.

#### Scenario: Concurrent bindings of one attempt
- **WHEN** two transactions bind the same attempt to two sessions of its task at once
- **THEN** one binding commits, and the other fails with `conflict`

### Requirement: Turn reports applied through the service
The service SHALL apply `recordTurnAcceptanceUnknown` and `recordTurnRefused` durably, so that after a restart `nextDeliverableTurn` returns nothing while an acceptance-unknown turn's generation runs, and moves past a refused turn at once.

#### Scenario: Refusal survives a restart
- **WHEN** a refusal is killed at `SessionTimelineCommit.after` and the host repeats it from a new process
- **THEN** the repeat changes nothing, and the next queued turn is deliverable in the same generation

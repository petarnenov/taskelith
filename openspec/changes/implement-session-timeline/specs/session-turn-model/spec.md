## ADDED Requirements

### Requirement: Durable session timeline service
The session timeline service SHALL apply every change of a session through the domain in one `SERIALIZABLE` transaction and SHALL return only after that transaction committed, so that no read shows a turn, request, or response that is not committed.

#### Scenario: Request committed before display
- **WHEN** the host's report of a native request is applied and the process is killed at `SessionTimelineCommit.before`
- **THEN** no read lists the request, and the repeated report records it once

### Requirement: Idempotent turn submission across restarts
The service SHALL resolve a repeated turn key before the domain by a keyed digest of the author and the unredacted text: the same digest SHALL return the first turn as `duplicate`, and another digest SHALL fail with `conflict`, also when both texts redact to the same text.

#### Scenario: Retry after a crash after the commit
- **WHEN** a submission is killed at `SessionTimelineCommit.after` and retried with the same key, author, and text
- **THEN** the retry returns `duplicate`, and the session holds one turn

#### Scenario: Same key from another author
- **WHEN** a key is submitted again with the same text by another author
- **THEN** the submission fails with `conflict`, and no turn is added

### Requirement: Response consumed once under concurrency
Of concurrent responses to one request, the service SHALL commit at most one; a repeat with the same response key and digest SHALL return the answered request, and every other response SHALL fail as `consumeResponse` requires.

#### Scenario: Two concurrent answers on PostgreSQL
- **WHEN** two transactions answer the same open request at once
- **THEN** one commits the response, and the other fails with `conflict`

### Requirement: Attempt unique across a task's sessions
The service SHALL bind an attempt to at most one session across all sessions, also when two bindings run concurrently.

#### Scenario: Concurrent bindings of one attempt
- **WHEN** two transactions bind the same attempt to two sessions of its task at once
- **THEN** one binding commits, and the other fails with `conflict`

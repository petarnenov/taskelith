## ADDED Requirements

### Requirement: Lock-wait barriers
A lock-wait barrier added or modified by a change in a PostgreSQL integration test, which waits until a statement waits for a lock, SHALL poll from a separate observer connection, not from the connection that holds the lock, SHALL match the waiter by its role and statement or by the awaited lock, so that no other waiter satisfies the barrier, and the test SHALL release the held lock and end its connections in cleanup that runs also when a step fails.

#### Scenario: The observer matches the waiter
- **WHEN** a test holds a lock and starts a statement that waits for it
- **THEN** a separate connection polls until a backend of the statement's role waits with that statement, or a backend waits for the lock the test holds, and only then does the test release the lock

#### Scenario: Cleanup after a failed step
- **WHEN** a barrier or an assertion fails while the test holds the lock
- **THEN** the cleanup releases the lock and ends the test's connections, so the waiter and the later tests of the file do not hang

## ADDED Requirements

### Requirement: Launch failure before W2 commits
A launch whose identifier, journal read, deadline clock read, or W2 commit fails SHALL send no request. Unless the commit was refused for space or the failure stopped the journal, it SHALL log `worker.launch.deferred` with the failure's code and message and try the intent again, with a new operation, after a jittered delay of 5 s doubling to 60 s, waited on a timer, until W2 commits, the intent is cancelled, or the worker stops.

#### Scenario: Unreadable deadline clock
- **WHEN** the deadline clock cannot be read at any try of a launch
- **THEN** the worker journals no W2 and sends no request, logs `worker.launch.deferred` with the clock's failure before each wait, each wait is within 5 s and 60 s, and the event loop turns between tries, so a callback queued before a try runs before the next

#### Scenario: Deadline clock readable again
- **WHEN** the deadline clock can be read again after such waits
- **THEN** the worker commits W2 and sends the first request for the launch's execution, and a later wait of the launch continues from the delays already waited

#### Scenario: Cancellation during the wait
- **WHEN** the intent is cancelled while the launch of its first execution waits after such a failure
- **THEN** the launch ends with no operation and no seal, and the cancellation's evidence is recorded

#### Scenario: Failed W2 commit
- **WHEN** the W2 commit of a launch fails for a reason other than space, rolls back, and commits at a later try
- **THEN** no request is sent before that commit, `worker.launch.deferred` is logged with the commit's failure before each wait, each wait is within 5 s and 60 s while the event loop turns, and the first request carries the operation of the W2 that committed

#### Scenario: Journal stopped at W2
- **WHEN** the W2 commit of a launch fails with an I/O error that stops the journal
- **THEN** the launch ends without a deferral and sends no request, and the worker stays stopped under the journal's write-failure rules

#### Scenario: Journal stopped at a read
- **WHEN** the journal read for a launch's next execution fails because the journal stopped
- **THEN** the launch ends without a deferral and sends no request

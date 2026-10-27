## ADDED Requirements

### Requirement: Launch failure before W2
A launch whose identifier, journal read, or deadline clock read fails before W2 SHALL commit no W2 and send no request. It SHALL log `worker.launch.deferred` with the failure's code and message and try the intent again after a jittered delay of 5 s doubling to 60 s, waited on a timer, until W2 commits, the intent is cancelled, or the worker stops.

#### Scenario: Unreadable deadline clock
- **WHEN** the deadline clock cannot be read at any try of a launch
- **THEN** the worker journals no W2 and sends no request, logs `worker.launch.deferred` with the clock's failure before each wait, each wait is within 5 s and 60 s, and the event loop turns between tries, so a callback queued before a try runs before the next

#### Scenario: Deadline clock readable again
- **WHEN** the deadline clock can be read again after such waits
- **THEN** the worker commits W2 and sends the first request for the launch's execution, and a later wait of the launch continues from the delays already waited

#### Scenario: Cancellation during the wait
- **WHEN** the intent is cancelled while the launch of its first execution waits after such a failure
- **THEN** the launch ends with no operation and no seal, and the cancellation's evidence is recorded

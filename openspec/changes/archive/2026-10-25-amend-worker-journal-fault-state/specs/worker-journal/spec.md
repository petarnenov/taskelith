## MODIFIED Requirements

### Requirement: Flush failure stops the journal
After an I/O error from a commit, a checkpoint, a synced write, or an `fsync`, a worker SHALL take none of the actions that write was to precede, SHALL stop acknowledging, requesting, and publishing, and SHALL resume only after a host restart or a new journal incarnation, never trusting a retried `fsync` or a reopened journal. It SHALL record the stop with the host boot identity, so that a worker restarted in the same boot stays stopped, and SHALL report a stop it could not record.

#### Scenario: Injected fsync failure
- **WHEN** a commit fails with an I/O error
- **THEN** the command is not acknowledged and the worker stays stopped until the host restarts or an operator starts a new incarnation

#### Scenario: Worker restarted in the same boot
- **WHEN** a worker whose journal stopped after a flush failure, and which recorded the stop, is restarted before the host restarts
- **THEN** it refuses to start, and a start after a later host boot removes the record and continues

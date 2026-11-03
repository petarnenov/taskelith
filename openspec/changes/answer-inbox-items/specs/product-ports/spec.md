## ADDED Requirements

### Requirement: Inbox source item read
`NeedsYouSource` SHALL read an item of a scope in any state by its identifier, and SHALL answer an item only in the scope of the inbox that `AnswerRequest` names, failing with `not-found` for an item of another project or scope.

#### Scenario: An item of another project
- **WHEN** a project's inbox answers an item of another project or of the installation
- **THEN** the source fails with `not-found` and changes nothing

### Requirement: Inbox answer stores
Execution SHALL define `InboxAnswerKeys`, one digest and first outcome per item and key, and `ReconciliationAnswers`, one resolved reconciliation item per identifier, each failing with `conflict` for a second record, with conformance cases that every adapter passes.

#### Scenario: A held key
- **WHEN** a key that an item already holds is recorded again
- **THEN** the store fails with `conflict` and keeps the first record

### Requirement: Every unrecorded process
`ReconciliationQueue.unrecordedProcesses` SHALL list every worker's unrecorded processes by record time, then worker and observation, for the installation inbox.

#### Scenario: Two workers
- **WHEN** two workers have reported unrecorded processes
- **THEN** the listing holds both workers' processes in record order

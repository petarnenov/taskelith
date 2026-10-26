## MODIFIED Requirements

### Requirement: Format versioning
A worker SHALL read the current journal format and every earlier format it lists, SHALL migrate an earlier one step by step in a single transaction, SHALL never downgrade a journal, and SHALL fail startup on a newer or unknown format.

#### Scenario: Newer journal format
- **WHEN** a worker finds a journal format newer than it supports
- **THEN** it fails startup and leaves the journal unchanged

#### Scenario: Two formats behind
- **WHEN** a worker supporting format 3 opens a format 1 journal
- **THEN** it migrates the journal through format 2 to format 3 in one transaction

## ADDED Requirements

### Requirement: Expired operation
W3 SHALL record an operation as `expired` when its deadline passed without a decision or the authority answered `expired`; such an operation of an execution without a grant, like a retryable rejection, SHALL allow a new operation for that execution, and W6 SHALL expire the operations of the execution that have no outcome.

#### Scenario: Restart after an expired operation
- **WHEN** the worker restarts with an execution whose last operation expired and no W4
- **THEN** it authorizes the same execution under a new `operationId` that reports it has not started

## MODIFIED Requirements

### Requirement: Format versioning
A worker SHALL read the current journal format and every earlier format it lists, SHALL migrate an earlier one step by step in a single transaction, SHALL never downgrade a journal, and SHALL fail startup on a newer or unknown format.

#### Scenario: Newer journal format
- **WHEN** a worker finds a journal format newer than it supports
- **THEN** it fails startup and leaves the journal unchanged

#### Scenario: Two formats behind
- **WHEN** a worker supporting format 4 opens a format 2 journal
- **THEN** it migrates the journal through format 3 to format 4 in one transaction

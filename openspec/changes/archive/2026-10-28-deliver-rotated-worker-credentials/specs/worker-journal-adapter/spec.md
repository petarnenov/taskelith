## ADDED Requirements

### Requirement: Credential adoption files
Before a renewal the worker SHALL create `worker/credentials/pending.<generation>` once at mode `0600`. Adoption SHALL create the new generation's files once, then replace `worker/identity` with the new generation as current and the previous one kept; after the confirmation it SHALL replace the identity without the previous one and then remove the previous files and the pending file, a removal that a start repeats while such files are left. Identity formats 1 and 2 SHALL be read.

#### Scenario: Crash after adoption
- **WHEN** the worker stops after the identity names the new generation and before the confirmation
- **THEN** the next start reads both generations' files, and the new generation is current

#### Scenario: Pending file of an earlier attempt
- **WHEN** the pending file of the requested generation exists
- **THEN** a new attempt keeps its content instead of generating other keys

#### Scenario: Crash after the identity dropped the predecessor
- **WHEN** the worker stops after the identity no longer names the previous generation and before its files and the pending file are removed
- **THEN** the next start removes them and keeps the current generation's files and the next generation's pending file

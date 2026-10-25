# evidence-store Specification

## Purpose
Content-addressed evidence storage for the control plane: authenticated and authorized publication, SHA-256 verified download, corruption and absence detection, and retention (architecture section 8, R31).

## Requirements

### Requirement: Evidence record
Every evidence record SHALL hold its producer identity, project, run, task, and attempt, the ownership generation at which it was produced, its input artifacts and code revision, its validator or producing program with its version, its outcome, the SHA-256 digest, type, and size of its content, its capture time, and its publication time.

#### Scenario: Invalid record
- **WHEN** a publication carries a content type that is not a lowercase media type
- **THEN** it is refused as `invalid` and nothing is stored

### Requirement: Producer authorization
`publishEvidence` SHALL require the worker credential, and SHALL store a record only when the authenticated worker held the named attempt of the named task, in the named run and project, at the stated ownership generation. Evidence of an earlier held generation SHALL be stored with `ownershipCurrent` false, and never counts as current evidence.

#### Scenario: Producer that never held the attempt
- **WHEN** a worker publishes evidence for an attempt it was never assigned at that generation
- **THEN** the answer is 403 and neither the record nor its content is stored

#### Scenario: Earlier generation
- **WHEN** a worker publishes evidence at a generation it held before the current one
- **THEN** the record is stored with `ownershipCurrent` false

### Requirement: Verified content
The control plane SHALL verify the content's size and SHA-256 digest before it stores the record, SHALL store the content on a durable volume under its digest before the record commits, and SHALL refuse to serve content that is missing or no longer matches its digest.

#### Scenario: Forged digest
- **WHEN** the content of a publication does not match its `contentDigest`
- **THEN** the answer is 400 and nothing is stored

#### Scenario: Corrupt content
- **WHEN** stored content no longer matches its digest
- **THEN** `downloadEvidence` answers 500 and serves no bytes, and a republication of the same content repairs the copy

### Requirement: Idempotent publication
A retry of the same publication by the same producer SHALL return the stored record with status 200, and another publication under a stored `evidenceId` SHALL be 409.

#### Scenario: Retried publication
- **WHEN** a worker repeats a publication after a lost response
- **THEN** the answer is 200 with the record stored first

### Requirement: Evidence reads
`readEvidence` and `downloadEvidence` SHALL require the operator credential, and `readTaskResult` SHALL return every evidence record of the task once an attempt has ended.

#### Scenario: Task result
- **WHEN** the result of a task with an ended attempt and published evidence is read
- **THEN** it lists the task's evidence records in publication order

### Requirement: Evidence retention
A record SHALL be removable only once 365 days have passed since its publication, and its content only when no record refers to its digest any more, serialized with publications of that digest.

#### Scenario: Early retirement
- **WHEN** a record younger than 365 days is retired
- **THEN** it is refused as `precondition-failed` with reason `retention-not-elapsed`

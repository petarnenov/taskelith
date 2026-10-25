## ADDED Requirements

### Requirement: Clock-independent migration order
The adapter SHALL keep migrations in the order of their file names, by numeric prefix and then by name, independently of the server clock: it SHALL fail with `precondition-failed`, naming the file, before applying anything when a pending file orders before an applied one, and SHALL NOT refuse a run because the recorded run times of applied files are out of order.

#### Scenario: Clock stepped back during a run
- **WHEN** the server clock stepped back between two applied files, so that the later file has the earlier run time, and the migrations run again
- **THEN** the run applies the pending files

#### Scenario: Pending file older than an applied one
- **WHEN** a pending file orders before an applied one and the migrations run
- **THEN** the run fails with `precondition-failed` naming that file, and no pending file is applied

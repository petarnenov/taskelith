## ADDED Requirements

### Requirement: Host side-effect check
A harness qualification SHALL name in its record the host directories it compares (at least the harness's default home and the directory of installed harness binaries), compare SHA-256 listings of their files and listings of their symlinks and directories before and after the series, and record every difference as proven to come from the qualified harness, attributed to another named process, or unexplained.

#### Scenario: Harness writes outside its dedicated directories
- **WHEN** a difference is proven to come from the qualified harness
- **THEN** the record describes the change, its timing, its cleanup, and the consequence for worker isolation

#### Scenario: Concurrent host processes
- **WHEN** other processes that use the same directories were running during the series
- **THEN** each difference attributed to them is marked as attributed, not proven

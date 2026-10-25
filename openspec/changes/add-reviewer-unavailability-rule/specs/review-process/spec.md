## ADDED Requirements

### Requirement: Unavailable reviewer
When an assigned reviewer is unavailable for any reason, it SHALL NOT be used for any change for the next 30 minutes. The next authorized reviewer in the rotation that is not paused SHALL become the change's reviewer for its remaining passes. The pass count SHALL carry over, and `verification.md` SHALL record the failed attempts and the switch.

#### Scenario: Assigned reviewer fails to run
- **WHEN** a pass by the assigned reviewer fails without opening a session
- **THEN** the next authorized reviewer in the rotation takes over the change, and its first pass confirms the resolution of the earlier passes' findings

#### Scenario: Pass count after a switch
- **WHEN** a change switches reviewer after its first pass
- **THEN** the replacement's first pass is the change's second pass

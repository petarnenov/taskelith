## MODIFIED Requirements

### Requirement: Context size warning
Under the protocol, a coordinator or worker session whose context approaches 150,000 tokens SHALL tell the owner and recommend `/compact` or `/clear`, after recording what a reset would lose, and SHALL then continue its work without waiting for either; a worker SHALL also tell the coordinator, and SHALL NOT recommend `/clear` in the middle of a task.

#### Scenario: Session nears the limit
- **WHEN** a session's context approaches 150,000 tokens
- **THEN** it records its state, tells the owner, recommends `/compact` or `/clear`, and continues its work without waiting

#### Scenario: Worker in the middle of a task
- **WHEN** a worker nears the limit before its handoff
- **THEN** it recommends `/compact`, not `/clear`, tells the coordinator, and keeps its task going

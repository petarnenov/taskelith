## REMOVED Requirements

### Requirement: Harness activity indicator
**Reason**: Its scenario "Ownership uncertain" treated loss of contact as uncertain ownership, which contradicts the supervisor identity contract; it is replaced by the requirement "Session activity indicator" with corrected scenarios.
**Migration**: Use the requirement "Session activity indicator" added below; its other scenarios are unchanged.

## ADDED Requirements

### Requirement: Session activity indicator
Every card or row that shows a harness session, on the board, in the task detail, on the agent session screen, in the "Needs you" inbox, and in the review queue, SHALL show a small round indicator beside the session's label that spins while the harness works and stays still while it waits or has stopped, and the label SHALL name the state.

#### Scenario: Harness works
- **WHEN** the agent session is live, or is stopping and the worker has not yet confirmed that it ended
- **THEN** its indicator spins on every screen that shows the session

#### Scenario: Harness waits
- **WHEN** the agent session waits for a person or for its next stage admission
- **THEN** the indicator is still, and the label or the card says what it waits for

#### Scenario: Harness stopped or absent
- **WHEN** the agent session has stopped, or the card has no session
- **THEN** the indicator is still and muted, and the label says that the session stopped or that there is none

#### Scenario: Reduced motion
- **WHEN** the user's system asks for reduced motion
- **THEN** no indicator spins, and the labels still name each state

#### Scenario: Worker unreachable
- **WHEN** Taskelith has lost contact with the session's worker and the worker has reported no uncertainty about the process
- **THEN** the indicator is still, and the label says that the worker is unreachable and when it was last in contact, while the attempt keeps its owner and its ownership generation

#### Scenario: Process state uncertain
- **WHEN** the worker reports that it can prove neither that the session's process runs nor that it ended
- **THEN** the indicator is still and drawn in the danger color, the label says that the process state is uncertain, and the card offers an audited reconciliation to a role allowed to make it

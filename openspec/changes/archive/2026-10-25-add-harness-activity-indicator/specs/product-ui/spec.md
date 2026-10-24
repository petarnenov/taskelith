## ADDED Requirements

### Requirement: Harness activity indicator
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

#### Scenario: Ownership uncertain
- **WHEN** Taskelith has lost contact with the session's worker and does not know whether the harness works
- **THEN** the indicator is still and drawn in the danger color, and the label says that ownership is uncertain

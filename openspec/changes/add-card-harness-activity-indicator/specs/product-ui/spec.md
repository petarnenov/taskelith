## ADDED Requirements

### Requirement: Card harness activity indicator
Every board card SHALL show a small round indicator beside its session label that spins while the card's harness works and stays still while the harness waits for a person or for the next admission, or has stopped, and the label SHALL name the state without relying on motion or color.

#### Scenario: Harness works
- **WHEN** the card's agent session is live or still stopping
- **THEN** the card's indicator spins

#### Scenario: Harness waits
- **WHEN** the card's agent session waits for an approval or for the next stage admission
- **THEN** the indicator is still and the label says what it waits for

#### Scenario: Reduced motion
- **WHEN** the user's system asks for reduced motion
- **THEN** the indicator does not spin and the label still names the state

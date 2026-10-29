## ADDED Requirements

### Requirement: Refused turns on the wire
The wire `TurnState` SHALL include `refused`, and a refused turn SHALL appear in `Turn` with the generation it was sent for, so that the wire states equal the domain's `TURN_STATES`.

#### Scenario: Turn refused by the plugin
- **WHEN** a client lists the turns of a session whose turn the harness plugin refused
- **THEN** the turn has state `refused` and its generation, and matches `Turn`

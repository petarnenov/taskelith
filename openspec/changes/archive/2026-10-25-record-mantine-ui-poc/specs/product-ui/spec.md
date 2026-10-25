## ADDED Requirements

### Requirement: Reference proof of concept
The SPA SHALL start from the Mantine proof of concept in `docs/ui-poc/` (ADR 0011) and follow its matching screen for each screen it builds. The proof of concept is reference material: where it differs from this specification or an ADR, they win, and the change that builds the screen SHALL record the difference.

#### Scenario: Screen built from the proof of concept
- **WHEN** a UI item builds a screen that the proof of concept shows
- **THEN** the item's change names the proof of concept source file it follows

#### Scenario: Screen differs from the proof of concept
- **WHEN** a UI item builds a screen that departs from the proof of concept's matching screen
- **THEN** the item's change records the departure and the requirement or decision that requires it

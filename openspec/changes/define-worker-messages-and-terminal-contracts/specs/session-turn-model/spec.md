## ADDED Requirements

### Requirement: Turn acceptance unknown
`recordTurnAcceptanceUnknown` SHALL make the earliest queued turn `outcome-unknown` in the named generation when the host cannot tell whether the port accepted it; the state SHALL be final, the turn SHALL never be resent, and `nextDeliverableTurn` SHALL move past it. A repeat SHALL return the session unchanged, a delivered or ended turn SHALL fail with `conflict`, and another queued turn with `precondition-failed`.

#### Scenario: Turn ID already seen
- **WHEN** the host reports that the port answered `conflict` for the earliest queued turn
- **THEN** the turn is `outcome-unknown`, and the next queued turn is the next deliverable turn

#### Scenario: Report after the generation ended
- **WHEN** the host reports a crash for the earliest queued turn after its generation ended
- **THEN** the turn is `outcome-unknown` and is not delivered in the next generation

#### Scenario: Turn not the earliest queued
- **WHEN** the host reports acceptance unknown for the second queued turn
- **THEN** it fails with `precondition-failed`

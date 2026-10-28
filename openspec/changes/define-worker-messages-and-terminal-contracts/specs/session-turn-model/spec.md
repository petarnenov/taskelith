## ADDED Requirements

### Requirement: Turn acceptance unknown
`recordTurnAcceptanceUnknown` SHALL make the earliest queued turn `outcome-unknown` in the named generation when the host cannot tell whether the port accepted it; it SHALL be final and never resent, and `nextDeliverableTurn` SHALL move past it only in a later generation. A repeat SHALL return the session unchanged, a delivered or ended turn SHALL fail with `conflict`, and another queued turn with `precondition-failed`.

#### Scenario: Turn ID already seen
- **WHEN** the host reports that the port answered `conflict` for the earliest queued turn while its generation runs
- **THEN** the turn is `outcome-unknown`, and no turn is deliverable until a later generation runs, where the next queued turn is the next deliverable turn

#### Scenario: One turn at a time
- **WHEN** a turn whose acceptance is unknown may still run in its generation
- **THEN** `nextDeliverableTurn` returns nothing in that generation, so no later turn is delivered while it may run

#### Scenario: Report after the generation ended
- **WHEN** the host reports a crash for the earliest queued turn after its generation ended
- **THEN** the turn is `outcome-unknown` and is not delivered in the next generation

#### Scenario: Turn not the earliest queued
- **WHEN** the host reports acceptance unknown for the second queued turn
- **THEN** it fails with `precondition-failed`

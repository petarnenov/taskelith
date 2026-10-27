## MODIFIED Requirements

### Requirement: Placement backoff
A task that no candidate accepts SHALL wait before its next try unless declined for lack of fleet capacity, and a pass after a store outage SHALL wait before the next pass, backing off exponentially from 5 seconds to at most 60 seconds with jitter (capacity reservation section 5); a success SHALL reset the wait. A task declined for lack of fleet capacity SHALL keep its wait unchanged, so the rotation decides when it is offered. A task that waits before its next try SHALL NOT be read as waiting.

#### Scenario: Repeated waiting
- **WHEN** a task is not placed in two consecutive tries for a reason other than a lack of fleet capacity
- **THEN** the second wait is longer than the first, and neither is below 5 nor above 60 seconds

#### Scenario: Blocked batch
- **WHEN** every task of a full batch waits before its next try and another task is placeable
- **THEN** a later pass reads and places that task

#### Scenario: Placed after waiting
- **WHEN** a task that waited is placed
- **THEN** its wait is cleared

#### Scenario: Capacity decline
- **WHEN** one slot frees per pass, one project waits with fifty tasks and another with one, and a pass places a task of the larger project and declines the smaller one's for lack of fleet capacity
- **THEN** the next pass places the smaller project's task, without a wait

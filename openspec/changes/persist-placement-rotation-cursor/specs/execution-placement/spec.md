## MODIFIED Requirements

### Requirement: Project rotation
Each waiting read SHALL take each project's oldest task before any project's next, and SHALL start after the installation's stored rotation cursor, wrapping around. After a pass the cursor SHALL move only by its offers before its first decline for lack of fleet capacity, an offer the store failed not counting: to the project of the last of them placed, else of the last of them, else it SHALL stay, so that every waiting project is read within a bounded number of passes.

#### Scenario: Many blocked projects
- **WHEN** 1200 older projects each have a blocked waiting task and a later project has a placeable one
- **THEN** that task is placed within about 1200 / 100 passes

#### Scenario: Wrap-around
- **WHEN** a read starts after the last project in id order
- **THEN** it reads the projects from the first one again

#### Scenario: One free slot
- **WHEN** one slot frees per pass, `p-a` waits with `a1`, `a2`, `a3`, and `p-b` with `b1`, `b2`, `b3` that started waiting later
- **THEN** six passes place `a1`, `b1`, `a2`, `b2`, `a3`, `b3`

#### Scenario: Full fleet between placements
- **WHEN** one slot frees every other pass, with `p-a` and `p-b` waiting as in "One free slot", and the fleet is full in the passes between
- **THEN** the passes place `a1`, `b1`, `a2`, `b2`, `a3`, `b3`

#### Scenario: Capacity freed during a pass
- **WHEN** a pass declines a task of `p-b` for lack of fleet capacity and then places a task of a later project
- **THEN** the next read starts with `p-b`

#### Scenario: Several placements in a pass
- **WHEN** a pass places tasks of several projects
- **THEN** the next read starts after the project of its last placement

#### Scenario: No candidate worker
- **WHEN** a pass finds no candidate worker and offers nothing
- **THEN** the next read starts after the same cursor as that pass

#### Scenario: Outage during a pass
- **WHEN** the store fails during a pass after it placed a task
- **THEN** the next read starts after the project of that placement

#### Scenario: Restart
- **WHEN** a pass places a task of `p-a`, the control plane restarts, and `p-a` and `p-b` each have a waiting task with one free slot
- **THEN** the first pass after the restart places the task of `p-b`

## ADDED Requirements

### Requirement: Rotation cursor storage
The installation SHALL store one rotation cursor. A placement that moves it SHALL store it in that placement's transaction. A move by declines alone SHALL be stored in one transaction at the end of the pass, also after an outage stopped the pass. A pass whose offers do not move the cursor SHALL NOT write it. Control-plane instances SHALL share the cursor, and the last write SHALL win.

#### Scenario: Crash after a placement
- **WHEN** a pass commits the placement of a task of `p-a` and every later transaction of the pass fails
- **THEN** the stored cursor is `p-a`

#### Scenario: Decline-only move
- **WHEN** a pass declines a task of `p-a` for its project's quota and then declines a task of `p-b` for lack of fleet capacity
- **THEN** the pass stores `p-a` once at its end

#### Scenario: Unmoved cursor
- **WHEN** a pass's first offer is declined for lack of fleet capacity
- **THEN** the pass does not write the cursor

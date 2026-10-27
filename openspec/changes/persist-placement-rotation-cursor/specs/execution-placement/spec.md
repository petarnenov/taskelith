## MODIFIED Requirements

### Requirement: Project rotation
Each waiting read SHALL take each project's oldest task before any project's next, starting after the rotation cursor, wrapping around. A pass SHALL make no offer after its first decline for lack of fleet capacity; the cursor SHALL move only by its offers before it, one the store failed not counting: to the project of the last of them placed, else of the last of them, else it SHALL stay, so that, while offers move it, every project with a waiting task is read within a bounded number of passes.

#### Scenario: Many blocked projects
- **WHEN** 1200 older projects each have a waiting task blocked by its own project's limit and a later project has a placeable one
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
- **WHEN** the first offer of a pass, a task of `p-b`, is declined for lack of fleet capacity, a slot frees during the rest of the pass, and nothing else changes
- **THEN** the pass offers no later task, and the next pass places the task of `p-b` in that slot

#### Scenario: Fleet full for many passes
- **WHEN** more than 100 projects wait, the fleet stays full for many passes, and then a slot frees
- **THEN** those passes place nothing and keep the cursor, and the next pass offers the slot first to the task of the first project after the cursor

#### Scenario: Own decline during a pass
- **WHEN** a pass declines a task of `p-a` because its project quota is used, and a task of the later project `p-b` is placeable
- **THEN** the same pass places the task of `p-b`

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
The installation SHALL store one rotation cursor, which survives a control-plane restart. Each placement SHALL store it in the placement's own transaction, the last one winning. A move by declines alone SHALL be stored in one transaction at the end of the pass, also after an outage, and only while the stored cursor is still the one the pass read. A pass whose offers do not move the cursor SHALL NOT write it.

#### Scenario: Crash after a placement
- **WHEN** a pass commits the placement of a task of `p-a` and every later transaction of the pass fails
- **THEN** the stored cursor is `p-a`

#### Scenario: Decline-only move
- **WHEN** a pass declines a task of `p-a` for its project's quota and then declines a task of `p-b` for lack of fleet capacity
- **THEN** the pass stores `p-a` once at its end

#### Scenario: Unmoved cursor
- **WHEN** a pass's first offer is declined for lack of fleet capacity
- **THEN** the pass does not write the cursor

#### Scenario: Lost commit reply
- **WHEN** a pass declines a task of `p-a` for its project's quota, then commits the placement of a task of `p-b` whose commit reply is lost
- **THEN** the stored cursor stays `p-b`

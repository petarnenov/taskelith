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

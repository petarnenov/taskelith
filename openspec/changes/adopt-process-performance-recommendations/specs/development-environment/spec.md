## ADDED Requirements

### Requirement: Docker slot lock
`make test` SHALL hold a host-wide, per-user Docker slot while its integration services run: a first-in, first-out queue of ticket directories in `${XDG_STATE_HOME:-$HOME/.local/state}/taskelith/docker-slot.lock`, created with `mkdir` so that it needs no `flock`. A waiter SHALL remove the ticket of a dead process, print the holder while it waits, and log wait and hold times in `docker-slot.log` next to the lock.

#### Scenario: Two runs at once
- **WHEN** `make test` runs in two worktrees of one user at the same time
- **THEN** the later run waits, prints the holder's process and worktree, and starts its services after the earlier run releases the slot

#### Scenario: Holder killed
- **WHEN** the process that holds the slot dies without releasing it
- **THEN** the next waiter removes its ticket and takes the slot

#### Scenario: Interrupted wait
- **WHEN** a waiting run is interrupted
- **THEN** it removes its own ticket and exits without starting services

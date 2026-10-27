## MODIFIED Requirements

### Requirement: Committed inventory before push
The `pre-push` hook SHALL refuse a push that it verifies, before it runs `make verify`, while the inventory files or their inputs have uncommitted changes, naming those paths, because `make verify` checks the working tree rather than the pushed commit; a push that only deletes refs runs no `make verify` and is not refused for them.

#### Scenario: Regenerated inventory left uncommitted
- **WHEN** a branch is pushed after `make dependency-inventory` while the regenerated files are not committed
- **THEN** the push is refused with the uncommitted paths and the remedy

#### Scenario: Unrelated uncommitted change
- **WHEN** only files outside the inventory and its inputs have uncommitted changes
- **THEN** the hook proceeds to `make verify`

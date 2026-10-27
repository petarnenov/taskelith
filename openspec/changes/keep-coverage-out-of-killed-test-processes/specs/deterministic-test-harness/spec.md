## ADDED Requirements

### Requirement: Coverage kept out of killed processes
`@taskelith/testing` SHALL provide an environment that passes no `NODE_V8_COVERAGE` to a child it starts, and a way for a test process to withhold it from the processes it starts. A test SHALL start every Node process that it, or the product code it drives, may kill without that variable, so that a kill during exit leaves no empty coverage file, while the test process still writes its own coverage.

#### Scenario: A killed child leaves no coverage file
- **WHEN** a test starts a Node child with the uncovered environment and kills it
- **THEN** the child writes no coverage file, and the coverage report of the run cannot fail on it

#### Scenario: Product spawns inherit no coverage directory
- **WHEN** a test withholds coverage and then drives product code that spawns with a copy of `process.env`
- **THEN** the spawned processes see no `NODE_V8_COVERAGE`, and the test process still writes its own coverage file

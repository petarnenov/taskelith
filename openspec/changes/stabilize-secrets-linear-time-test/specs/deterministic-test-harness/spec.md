## ADDED Requirements

### Requirement: Linear-time assertions
`assertLinearOnRuns` SHALL judge a transform by how the CPU time of its thread grows with the run length, not by an absolute limit: it SHALL time each unit's run and a run of a quarter of its length in five alternating samples, each after a forced garbage collection, compare the medians with a floor of 20 ms, and fail, naming the unit, both lengths, and both medians, when the time grows 2.5 or more times faster than the length.

#### Scenario: A quadratic redactor fails
- **WHEN** a redactor that searches the rest of the text for a revealed value from every position is checked on the unit `a b`, which never holds the value, with the length 16000
- **THEN** the assertion fails with a message that names `"a b"`, the lengths 4002 and 16002, and the median CPU time of each

#### Scenario: A pause in one sample passes
- **WHEN** the first long sample of a transform that otherwise does no work pauses for 300 ms, as a garbage collection can pause it
- **THEN** the assertion passes, because the median of the five long samples leaves the pause out

#### Scenario: Both runs of every unit
- **WHEN** a transform is checked on the units `a.` and `abc` with the length 12
- **THEN** it receives the runs `a.a.` and `a.` repeated 6 times, and `abc` and `abc` repeated 4 times, and the assertion passes

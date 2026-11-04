## ADDED Requirements

### Requirement: Linear-time assertions
`assertLinearOnRuns` SHALL judge a transform by how the CPU time of its thread grows with the run length: it SHALL time each unit's run and a quarter run in five alternating samples after a forced garbage collection, double both runs until the short median reaches 20 ms or the run 2^24 characters, floor both medians at 20 ms, and fail, naming the unit, both lengths, and both medians, when the time grows 2.5 or more times faster than the length. Importing it SHALL NOT expose garbage collection.

#### Scenario: A quadratic redactor fails on runs sized to the host
- **WHEN** a redactor that searches the rest of the text for a revealed value from every position is checked with the thread's CPU time on the unit `a b`, which never holds the value, from the length 1000
- **THEN** the runs double until the short median reaches 20 ms, and the assertion fails with a message that names `"a b"`, both lengths, and both medians

#### Scenario: Growth at the limit
- **WHEN** an injected timer reads 20 ms for each short sample of the unit `a` at the length 4000 and 200 ms for each long sample
- **THEN** the assertion fails with the growth 2.5, while 199.9 ms for each long sample passes, and 25 and 400 ms fail with the growth 4.0

#### Scenario: Runs double to the floor
- **WHEN** an injected timer reads 1 ms per 1000 characters for the unit `a` from the length 4000
- **THEN** the short run doubles from 1000 to 32000 characters and the long run has 128000

#### Scenario: The longest runs
- **WHEN** an injected timer reads 1 ms for each short sample of the unit `a` at the length 2^24
- **THEN** the assertion passes with 79 ms for each long sample, as both medians count as at least 20 ms, and fails with 200 ms

#### Scenario: A pause in one sample passes
- **WHEN** an injected timer reads 30 ms for each short sample and 420 ms for the first long sample and 120 ms for the others
- **THEN** the assertion passes, because the median of the five long samples leaves the pause out

#### Scenario: Both runs of every unit
- **WHEN** a transform is checked on the units `a.` and `abc` with the length 12 and an injected timer that reads 10 ms per character
- **THEN** it receives the runs `a.a.` and `a.` repeated 6 times, and `abc` and `abc` repeated 4 times, and the assertion passes

#### Scenario: Importing the package
- **WHEN** a test process imports `@taskelith/testing` and makes no linear-time assertion
- **THEN** `gc` stays undefined in a new context

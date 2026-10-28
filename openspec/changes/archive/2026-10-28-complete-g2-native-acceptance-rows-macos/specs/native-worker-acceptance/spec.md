## ADDED Requirements

### Requirement: macOS cancellation and connectivity scenarios in native acceptance
The macOS entry of `make native-acceptance` SHALL run the G2 cancellation races, race g included, and the stale generations as `acceptance-cancellation-races` (cancellation) and the partitions as `acceptance-partition` (connectivity) through `make verify-macos-g2-scenarios`, whose records SHALL carry the proof's acceptance context.

#### Scenario: macOS host
- **WHEN** `make native-acceptance ENTRIES=macos RESULTS=results.jsonl` runs on a macOS host
- **THEN** `results.jsonl` gains `acceptance-cancellation-races` and `acceptance-partition` with target `harness-composition` and the macOS entry, and each scenario record of those proofs carries the same acceptance context
